import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, lt } from "drizzle-orm";
import {
	forkTimesheetProposals,
	forkTimesheetSettings,
} from "../db/fork-schema";
import type { HostServiceContext } from "../types";
import type { ForkJiraProvider } from "./fork-jira";
import { forkLocalDate, forkResolveLocalTime } from "./fork-jira-time";
import {
	forkAddJiraWorklog,
	forkJiraWorklogs,
	forkParseJiraTime,
} from "./fork-jira-worklog";
import {
	type ForkTimesheetProposal,
	type ForkTimesheetSettings,
	type ForkTimesheetTaskInput,
	forkDefaultTimesheetSettings,
	forkProposeTimesheet,
} from "./fork-timesheet";

type Ctx = Pick<HostServiceContext, "db" | "organizationId">;

const CLOSED_STATUSES = ["Resolved", "Risolto", "Closed", "Chiuso", "Done"];
const PROPOSAL_TTL_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

export function forkTimesheetSettingsFor(
	ctx: Ctx,
	connectionId: string,
): ForkTimesheetSettings {
	const row = ctx.db
		.select()
		.from(forkTimesheetSettings)
		.where(
			and(
				eq(forkTimesheetSettings.scope, ctx.organizationId),
				eq(forkTimesheetSettings.connectionId, connectionId),
			),
		)
		.get();
	return { ...forkDefaultTimesheetSettings(), ...(row?.settings ?? {}) };
}

export function forkSaveTimesheetSettings(
	ctx: Ctx,
	connectionId: string,
	settings: ForkTimesheetSettings,
): void {
	ctx.db
		.insert(forkTimesheetSettings)
		.values({ scope: ctx.organizationId, connectionId, settings })
		.onConflictDoUpdate({
			target: [forkTimesheetSettings.scope, forkTimesheetSettings.connectionId],
			set: { settings },
		})
		.run();
}

function requireEnabled(settings: ForkTimesheetSettings): void {
	if (!settings.enabled)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Turn on timesheet proposals in the Jira settings first",
		});
	if (!settings.project.trim())
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Choose the Jira project for timesheet proposals",
		});
}

const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

function moduleClause(settings: ForkTimesheetSettings, modules: string[]) {
	const field = settings.moduleField.trim();
	if (!field || modules.length === 0) return [];
	const id = /^customfield_(\d+)$/.exec(field)?.[1];
	const name = id ? `cf[${id}]` : quote(field);
	return [`${name} in (${modules.map(quote).join(", ")})`];
}

interface SearchIssue {
	key: string;
	fields: {
		summary?: string;
		issuetype?: { name?: string };
		created?: string;
		resolutiondate?: string | null;
		comment?: { total?: number; comments?: unknown[] };
		issuelinks?: unknown[];
		timespent?: number | null;
	};
}

async function searchAll(
	jira: ForkJiraProvider,
	connectionId: string,
	jql: string,
	fields: string[],
): Promise<SearchIssue[]> {
	const issues: SearchIssue[] = [];
	let token: string | undefined;
	for (let page = 0; page < 20; page++) {
		const result = await jira.api.request<{
			issues: SearchIssue[];
			nextPageToken?: string;
		}>(connectionId, "/rest/api/3/search/jql", "POST", {
			jql,
			fields,
			maxResults: 100,
			...(token ? { nextPageToken: token } : {}),
		});
		issues.push(...result.issues);
		token = result.nextPageToken;
		if (!token) break;
	}
	return issues;
}

const FIELDS = [
	"summary",
	"issuetype",
	"created",
	"resolutiondate",
	"comment",
	"issuelinks",
	"timespent",
];

function commentCount(issue: SearchIssue): number {
	return (
		issue.fields.comment?.total ?? issue.fields.comment?.comments?.length ?? 0
	);
}

/** Day the issue first moved into an "in progress" status, if known. */
async function workStarted(
	jira: ForkJiraProvider,
	connectionId: string,
	key: string,
	inProgress: Set<string>,
	timeZone: string,
): Promise<string | null> {
	let startAt = 0;
	for (let page = 0; page < 5; page++) {
		const result = await jira.api.request<{
			values: {
				created: string;
				items: { field: string; to?: string | null }[];
			}[];
			total: number;
		}>(
			connectionId,
			`/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=100`,
		);
		for (const entry of result.values)
			if (
				entry.items.some(
					(item) =>
						item.field === "status" && item.to && inProgress.has(item.to),
				)
			)
				return forkLocalDate(forkParseJiraTime(entry.created), timeZone);
		startAt += result.values.length;
		if (startAt >= result.total || result.values.length === 0) break;
	}
	return null;
}

function addDays(day: string, days: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
		.toISOString()
		.slice(0, 10);
}

export async function forkTimesheetPropose(
	ctx: Ctx,
	jira: ForkJiraProvider,
	input: {
		connectionId: string;
		from?: string;
		to?: string;
		modules?: string[];
		extraVacations?: { from: string; to: string }[];
		now?: number;
	},
): Promise<{ id: string; from: string; to: string } & ForkTimesheetProposal> {
	const settings = forkTimesheetSettingsFor(ctx, input.connectionId);
	requireEnabled(settings);
	const now = input.now ?? Date.now();
	const today = forkLocalDate(now, settings.timeZone);
	const to = input.to ?? today;
	const from = input.from ?? addDays(to, -30);
	if (from > to)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The period ends before it starts",
		});
	const modules = input.modules ?? settings.modules;
	const project = `project = ${quote(settings.project.trim())}`;
	const extra = moduleClause(settings, modules);
	const doneJql = [
		`status CHANGED TO (${CLOSED_STATUSES.map(quote).join(", ")}) BY currentUser()`,
		`resolutiondate >= "${from}"`,
		`resolutiondate <= "${to} 23:59"`,
		"timespent is EMPTY",
		project,
		...extra,
	].join(" AND ");
	const progressJql = [
		"assignee = currentUser()",
		'statusCategory = "In Progress"',
		project,
		...extra,
	].join(" AND ");
	const [done, progress, statuses, logged] = await Promise.all([
		searchAll(
			jira,
			input.connectionId,
			`${doneJql} ORDER BY resolutiondate ASC`,
			FIELDS,
		),
		settings.includeInProgress
			? searchAll(jira, input.connectionId, progressJql, FIELDS)
			: Promise.resolve([]),
		settings.includeInProgress
			? jira.api.request<{ id: string; statusCategory?: { key: string } }[]>(
					input.connectionId,
					"/rest/api/3/status",
				)
			: Promise.resolve([]),
		searchAll(
			jira,
			input.connectionId,
			`worklogAuthor = currentUser() AND worklogDate >= "${from}" AND worklogDate <= "${to}"`,
			["summary"],
		),
	]);
	const local = (value: string) =>
		forkLocalDate(forkParseJiraTime(value), settings.timeZone);
	const dayEnd = forkResolveLocalTime({
		date: today,
		time: settings.dayEnd,
		timeZone: settings.timeZone,
	});
	const openUntil =
		to < today || (dayEnd.kind !== "missing" && now >= dayEnd.instant)
			? to
			: addDays(today, -1);
	const inProgress = new Set(
		statuses
			.filter((status) => status.statusCategory?.key === "indeterminate")
			.map((status) => status.id),
	);
	const doneKeys = new Set(done.map((issue) => issue.key));
	const tasks: ForkTimesheetTaskInput[] = [
		...done.map((issue) => ({
			key: issue.key,
			summary: issue.fields.summary ?? "",
			type: issue.fields.issuetype?.name ?? null,
			comments: commentCount(issue),
			links: issue.fields.issuelinks?.length ?? 0,
			state: "done" as const,
			from: issue.fields.created ? local(issue.fields.created) : from,
			to: issue.fields.resolutiondate ? local(issue.fields.resolutiondate) : to,
		})),
		...(await Promise.all(
			progress
				.filter((issue) => !doneKeys.has(issue.key))
				.map(async (issue) => ({
					key: issue.key,
					summary: issue.fields.summary ?? "",
					type: issue.fields.issuetype?.name ?? null,
					comments: commentCount(issue),
					links: issue.fields.issuelinks?.length ?? 0,
					state: "in_progress" as const,
					from:
						(await workStarted(
							jira,
							input.connectionId,
							issue.key,
							inProgress,
							settings.timeZone,
						)) ?? (issue.fields.created ? local(issue.fields.created) : from),
					to: openUntil,
				})),
		)),
	].filter((task) => task.from <= task.to || task.state === "done");
	const existing = new Map<string, number>();
	const after = forkResolveLocalTime({
		date: from,
		time: "00:00",
		timeZone: settings.timeZone,
	});
	const before = forkResolveLocalTime({
		date: addDays(to, 1),
		time: "00:00",
		timeZone: settings.timeZone,
	});
	for (const issue of logged) {
		let startAt: number | null = 0;
		while (startAt !== null) {
			const page = await forkJiraWorklogs(jira, {
				connectionId: input.connectionId,
				key: issue.key,
				startAt,
				...(after.kind === "missing"
					? {}
					: { startedAfter: after.instant - 1 }),
				...(before.kind === "missing" ? {} : { startedBefore: before.instant }),
			});
			for (const entry of page.items) {
				if (!entry.mine) continue;
				const day = local(entry.started);
				if (day < from || day > to) continue;
				existing.set(day, (existing.get(day) ?? 0) + entry.timeSpentSeconds);
			}
			startAt = page.nextStartAt;
		}
	}
	const proposal = forkProposeTimesheet({
		settings,
		from,
		to,
		tasks,
		existingSeconds: existing,
		extraVacations: input.extraVacations,
		equalDistribution:
			done.length === 0 &&
			progress.length > 0 &&
			progress.every((issue) => (issue.fields.timespent ?? 0) > 0),
		newId: randomUUID,
	});
	ctx.db
		.delete(forkTimesheetProposals)
		.where(lt(forkTimesheetProposals.createdAt, now - PROPOSAL_TTL_MS))
		.run();
	const id = randomUUID();
	ctx.db
		.insert(forkTimesheetProposals)
		.values({
			id,
			scope: ctx.organizationId,
			connectionId: input.connectionId,
			data: proposal,
			createdAt: now,
		})
		.run();
	return { id, from, to, ...proposal };
}

export async function forkTimesheetPost(
	ctx: Ctx,
	jira: ForkJiraProvider,
	input: {
		proposalId: string;
		entries: {
			id: string;
			key: string;
			date: string;
			time: string;
			seconds: number;
		}[];
	},
): Promise<{ id: string; ok: boolean; error?: string }[]> {
	const row = ctx.db
		.select()
		.from(forkTimesheetProposals)
		.where(
			and(
				eq(forkTimesheetProposals.id, input.proposalId),
				eq(forkTimesheetProposals.scope, ctx.organizationId),
			),
		)
		.get();
	if (!row)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "This proposal expired. Prepare a new one.",
		});
	const settings = forkTimesheetSettingsFor(ctx, row.connectionId);
	requireEnabled(settings);
	const proposal = row.data;
	const known = new Set(proposal.entries.map((entry) => entry.id));
	const keys = new Set(proposal.tasks.map((task) => task.key));
	const existing = new Map(
		proposal.days.map((day) => [day.date, day.existingSeconds]),
	);
	const totals = new Map(existing);
	for (const entry of input.entries) {
		if (
			!known.has(entry.id) ||
			!keys.has(entry.key) ||
			!existing.has(entry.date)
		)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "An entry is not part of the proposal",
			});
		totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.seconds);
	}
	for (const [day, seconds] of totals)
		if (seconds > settings.maxHours * 3600 + 60)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${day} would go over ${settings.maxHours} hours`,
			});
	const results: { id: string; ok: boolean; error?: string }[] = [];
	for (const entry of input.entries) {
		try {
			await forkAddJiraWorklog(ctx, jira, {
				connectionId: row.connectionId,
				key: entry.key,
				clientOpId: entry.id,
				date: entry.date,
				time: entry.time,
				timeZone: settings.timeZone,
				timeSpentSeconds: entry.seconds,
			});
			results.push({ id: entry.id, ok: true });
		} catch (error) {
			results.push({
				id: entry.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}
