import type { ForkWorklog } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { and, eq, lt } from "drizzle-orm";
import { forkJiraWorklogOps } from "../db/fork-schema";
import type { HostServiceContext } from "../types";
import { type AdfNode, adfToMarkdown, markdownToAdf } from "./fork-adf";
import type { ForkJiraProvider } from "./fork-jira";
import {
	forkJiraStarted,
	forkLocalDate,
	forkResolveLocalTime,
} from "./fork-jira-time";

type Ctx = Pick<HostServiceContext, "db" | "organizationId">;

interface JiraWorklog {
	id: string;
	author?: { accountId: string; displayName: string };
	started: string;
	timeSpentSeconds: number;
	comment?: AdfNode | null;
	created: string;
}

const OP_RETENTION_MS = 30 * 86_400_000;

/** Jira writes offsets as +0100; Date.parse needs +01:00. */
export function forkParseJiraTime(value: string): number {
	return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

async function myAccountId(jira: ForkJiraProvider, connectionId: string) {
	const known = jira.assert(connectionId).identity?.id;
	if (known) return known;
	const me = await jira.api.request<{ accountId: string }>(
		connectionId,
		"/rest/api/3/myself",
	);
	return me.accountId;
}

function worklog(entry: JiraWorklog, me: string): ForkWorklog {
	return {
		id: entry.id,
		author: {
			id: entry.author?.accountId ?? "",
			name: entry.author?.displayName ?? "",
		},
		mine: entry.author?.accountId === me,
		started: entry.started,
		timeSpentSeconds: entry.timeSpentSeconds,
		comment: entry.comment ? adfToMarkdown(entry.comment) : "",
		created: entry.created,
	};
}

export async function forkJiraWorklogs(
	jira: ForkJiraProvider,
	input: {
		connectionId: string;
		key: string;
		startAt?: number;
		startedAfter?: number;
		startedBefore?: number;
	},
): Promise<{
	items: ForkWorklog[];
	total: number;
	nextStartAt: number | null;
}> {
	const startAt = input.startAt ?? 0;
	const query = new URLSearchParams({
		startAt: String(startAt),
		maxResults: "50",
		...(input.startedAfter === undefined
			? {}
			: { startedAfter: String(input.startedAfter) }),
		...(input.startedBefore === undefined
			? {}
			: { startedBefore: String(input.startedBefore) }),
	});
	const [me, page] = await Promise.all([
		myAccountId(jira, input.connectionId),
		jira.api.request<{
			worklogs: JiraWorklog[];
			total: number;
			startAt: number;
		}>(
			input.connectionId,
			`/rest/api/3/issue/${encodeURIComponent(input.key)}/worklog?${query}`,
		),
	]);
	const next = startAt + page.worklogs.length;
	return {
		items: page.worklogs.map((entry) => worklog(entry, me)),
		total: page.total,
		nextStartAt: next < page.total && page.worklogs.length > 0 ? next : null,
	};
}

export type ForkWorklogCapability =
	| { canLog: true }
	| { canLog: false; reason: "time-tracking-off" | "no-permission" };

export async function forkJiraWorklogCapability(
	jira: ForkJiraProvider,
	connectionId: string,
	key: string,
): Promise<ForkWorklogCapability> {
	jira.assert(connectionId);
	const [tracking, permissions] = await Promise.all([
		jira.api
			.request<{ key?: string } | undefined>(
				connectionId,
				"/rest/api/3/configuration/timetracking",
			)
			.catch((error: unknown) => {
				if (error instanceof TRPCError && error.code === "NOT_FOUND")
					return undefined;
				throw error;
			}),
		jira.api.request<{
			permissions: Record<string, { havePermission: boolean }>;
		}>(
			connectionId,
			`/rest/api/3/mypermissions?issueKey=${encodeURIComponent(key)}&permissions=WORK_ON_ISSUES`,
		),
	]);
	if (!tracking?.key) return { canLog: false, reason: "time-tracking-off" };
	if (!permissions.permissions.WORK_ON_ISSUES?.havePermission)
		return { canLog: false, reason: "no-permission" };
	return { canLog: true };
}

function uncertain(error: unknown): boolean {
	if (!(error instanceof TRPCError)) return true;
	const status = (error.cause as { status?: number } | undefined)?.status;
	return status === undefined || status >= 500;
}

async function findPosted(
	jira: ForkJiraProvider,
	op: {
		connectionId: string;
		issueKey: string;
		started: string;
		seconds: number;
	},
): Promise<string | null> {
	const at = forkParseJiraTime(op.started);
	const page = await forkJiraWorklogs(jira, {
		connectionId: op.connectionId,
		key: op.issueKey,
		startedAfter: at - 60_000,
		startedBefore: at + 60_000,
	});
	return (
		page.items.find(
			(entry) =>
				entry.mine &&
				entry.timeSpentSeconds === op.seconds &&
				forkParseJiraTime(entry.started) === at,
		)?.id ?? null
	);
}

export interface ForkAddWorklogInput {
	connectionId: string;
	key: string;
	clientOpId: string;
	date: string;
	time: string;
	timeZone: string;
	timeSpentSeconds: number;
	comment?: string;
}

const inFlight = new Set<string>();

/**
 * Posts a worklog at most once per `clientOpId`. When Jira does not answer,
 * the operation stays "unknown" and the next attempt looks for it in Jira
 * before posting again.
 */
export async function forkAddJiraWorklog(
	ctx: Ctx,
	jira: ForkJiraProvider,
	input: ForkAddWorklogInput,
): Promise<{ worklogId: string; reused: boolean; ambiguousTime: boolean }> {
	const flightKey = `${ctx.organizationId}:${input.clientOpId}`;
	if (inFlight.has(flightKey))
		throw new TRPCError({
			code: "CONFLICT",
			message: "This time is already being sent to Jira",
		});
	inFlight.add(flightKey);
	try {
		return await forkAddJiraWorklogOnce(ctx, jira, input);
	} finally {
		inFlight.delete(flightKey);
	}
}

async function forkAddJiraWorklogOnce(
	ctx: Ctx,
	jira: ForkJiraProvider,
	input: ForkAddWorklogInput,
): Promise<{ worklogId: string; reused: boolean; ambiguousTime: boolean }> {
	ctx.db
		.delete(forkJiraWorklogOps)
		.where(
			and(
				eq(forkJiraWorklogOps.state, "done"),
				lt(forkJiraWorklogOps.createdAt, Date.now() - OP_RETENTION_MS),
			),
		)
		.run();
	const resolved = forkResolveLocalTime(input);
	if (resolved.kind === "missing")
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This time does not exist on that day because the clock moves forward. Choose another time.",
		});
	const started = forkJiraStarted(resolved);
	const where = and(
		eq(forkJiraWorklogOps.id, input.clientOpId),
		eq(forkJiraWorklogOps.scope, ctx.organizationId),
	);
	const existing = ctx.db.select().from(forkJiraWorklogOps).where(where).get();
	if (existing?.state === "done" && existing.worklogId)
		return {
			worklogId: existing.worklogId,
			reused: true,
			ambiguousTime: resolved.kind === "ambiguous",
		};
	if (existing) {
		const found = await findPosted(jira, existing);
		if (found) {
			ctx.db
				.update(forkJiraWorklogOps)
				.set({ state: "done", worklogId: found })
				.where(where)
				.run();
			return {
				worklogId: found,
				reused: true,
				ambiguousTime: resolved.kind === "ambiguous",
			};
		}
		ctx.db.delete(forkJiraWorklogOps).where(where).run();
	}
	ctx.db
		.insert(forkJiraWorklogOps)
		.values({
			id: input.clientOpId,
			scope: ctx.organizationId,
			connectionId: input.connectionId,
			issueKey: input.key,
			started,
			seconds: input.timeSpentSeconds,
			comment: input.comment ?? null,
			state: "pending",
			createdAt: Date.now(),
		})
		.run();
	try {
		const created = await jira.api.request<{ id: string }>(
			input.connectionId,
			`/rest/api/3/issue/${encodeURIComponent(input.key)}/worklog?adjustEstimate=leave`,
			"POST",
			{
				started,
				timeSpentSeconds: input.timeSpentSeconds,
				...(input.comment?.trim()
					? { comment: markdownToAdf(input.comment.trim()) }
					: {}),
			},
		);
		ctx.db
			.update(forkJiraWorklogOps)
			.set({ state: "done", worklogId: created.id })
			.where(where)
			.run();
		return {
			worklogId: created.id,
			reused: false,
			ambiguousTime: resolved.kind === "ambiguous",
		};
	} catch (error) {
		if (!uncertain(error)) {
			ctx.db.delete(forkJiraWorklogOps).where(where).run();
			throw error;
		}
		ctx.db
			.update(forkJiraWorklogOps)
			.set({ state: "unknown" })
			.where(where)
			.run();
		throw new TRPCError({
			code: "TIMEOUT",
			message:
				"Jira did not confirm the worklog. Try again: Superset checks Jira first and does not log the time twice.",
		});
	}
}

/** The current user's time logged on a day, across all issues. */
export async function forkMyJiraTime(
	jira: ForkJiraProvider,
	input: { connectionId: string; date: string; timeZone: string },
): Promise<{
	seconds: number;
	issues: { key: string; title: string; seconds: number }[];
}> {
	const dayStart = forkResolveLocalTime({ ...input, time: "00:00" });
	const nextDay = new Date(`${input.date}T00:00:00Z`);
	nextDay.setUTCDate(nextDay.getUTCDate() + 1);
	const dayEnd = forkResolveLocalTime({
		date: nextDay.toISOString().slice(0, 10),
		time: "00:00",
		timeZone: input.timeZone,
	});
	if (dayStart.kind === "missing" || dayEnd.kind === "missing")
		return { seconds: 0, issues: [] };
	const found = await jira.api.request<{
		issues: { key: string; fields: { summary: string } }[];
	}>(input.connectionId, "/rest/api/3/search/jql", "POST", {
		jql: `worklogAuthor = currentUser() AND worklogDate = "${input.date}"`,
		fields: ["summary"],
		maxResults: 50,
	});
	const issues = await Promise.all(
		found.issues.map(async (issue) => {
			const page = await forkJiraWorklogs(jira, {
				connectionId: input.connectionId,
				key: issue.key,
				startedAfter: dayStart.instant - 1,
				startedBefore: dayEnd.instant,
			});
			const seconds = page.items
				.filter(
					(entry) =>
						entry.mine &&
						forkLocalDate(forkParseJiraTime(entry.started), input.timeZone) ===
							input.date,
				)
				.reduce((sum, entry) => sum + entry.timeSpentSeconds, 0);
			return { key: issue.key, title: issue.fields.summary, seconds };
		}),
	);
	const logged = issues.filter((issue) => issue.seconds > 0);
	return {
		seconds: logged.reduce((sum, issue) => sum + issue.seconds, 0),
		issues: logged,
	};
}
