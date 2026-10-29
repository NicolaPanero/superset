import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	forkAutomationAttempts,
	forkAutomationSettings,
	forkJiraAutomationLaunches,
	forkJiraAutomationRuns,
	forkJiraAutomations,
} from "../../../db/fork-schema";
import { projects } from "../../../db/schema";
import {
	forkAutomationLimits,
	forkAutomationPrompt,
	forkAutomationRule,
	forkPreviewAutomationEvents,
	forkQueueAutomationEvent,
	forkRetryAutomationAttempt,
	forkSaveAutomationOptions,
} from "../../../fork-integrations/fork-automation-engine";
import {
	type ForkAutomationEvent,
	type ForkAutomationRule,
	forkAutomationSources,
	forkJiraEvents,
} from "../../../fork-integrations/fork-automation-sources";
import { forkKickAutomations } from "../../../fork-integrations/fork-jira-automations";
import {
	forkJiraLaunchSchema,
	prepareForkJiraLaunch,
} from "../../../fork-integrations/fork-jira-launch";
import { forkServices } from "../../../fork-integrations/fork-services";
import type { HostServiceContext } from "../../../types";
import { machineOnlyProcedure } from "../../index";

const local = machineOnlyProcedure.use(({ ctx, next }) => {
	if (ctx.isLocalCaller === false)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Manage Jira automations on the host computer",
		});
	return next({ ctx });
});
const id = z.object({ id: z.string().uuid() });
const sourceKind = z.enum(["jira", "pr_comments", "ci_failure", "schedule"]);
const timeZone = z
	.string()
	.min(1)
	.max(100)
	.refine((value) => {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}, "Unknown time zone");
const scheduleConfig = z.object({
	days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
	time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
	timeZone,
});
const ruleOptions = z.object({
	sourceKind: sourceKind.default("jira"),
	schedule: scheduleConfig.optional(),
	refire: z.enum(["never", "status_change"]).default("never"),
	catchupMinutes: z
		.number()
		.int()
		.min(0)
		.max(7 * 24 * 60)
		.default(120),
	verifyCommand: z.string().trim().max(2000).nullable().default(null),
	retryLimit: z.number().int().min(1).max(5).default(3),
	targetLimit: z.number().int().min(1).max(50).nullable().default(null),
});
type RuleOptions = z.infer<typeof ruleOptions>;

function optionsRow(options: RuleOptions) {
	return {
		sourceKind: options.sourceKind,
		sourceConfig:
			options.sourceKind === "schedule" && options.schedule
				? options.schedule
				: {},
		refire: options.refire,
		catchupMinutes: options.catchupMinutes,
		verifyCommand: options.verifyCommand || null,
		retryLimit: options.retryLimit,
		targetLimit: options.targetLimit,
	};
}

function checkOptions(input: { jql: string; options?: RuleOptions }) {
	const kind = input.options?.sourceKind ?? "jira";
	if (kind === "jira" && !input.jql.trim())
		throw new TRPCError({ code: "BAD_REQUEST", message: "Write a JQL query" });
	if (kind === "schedule" && !input.options?.schedule)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Choose the days and the time",
		});
}

function ownedRule(ctx: HostServiceContext, ruleId: string) {
	const rule = forkAutomationRule(ctx, ruleId);
	if (!rule)
		throw new TRPCError({ code: "NOT_FOUND", message: "Automation not found" });
	return rule;
}

function ownedAttempt(ctx: HostServiceContext, attemptId: string) {
	const attempt = ctx.db
		.select()
		.from(forkAutomationAttempts)
		.where(eq(forkAutomationAttempts.id, attemptId))
		.get();
	if (!attempt || !forkAutomationRule(ctx, attempt.ruleId))
		throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
	return attempt;
}

async function manualEvent(
	ctx: HostServiceContext,
	rule: ForkAutomationRule,
	taskKey: string | undefined,
): Promise<ForkAutomationEvent> {
	const key = `manual:${randomUUID()}`;
	if (rule.options.sourceKind === "jira") {
		if (!taskKey)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Choose the issue to run on",
			});
		const task = await forkServices(ctx).jira.get(rule.connectionId, taskKey);
		const [event] = forkJiraEvents(rule, [task]);
		if (!event)
			throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
		return { ...event, key, items: [{ key, text: "" }] };
	}
	if (rule.options.sourceKind === "schedule")
		return {
			key,
			target: null,
			title: `${rule.name} · ${new Date().toISOString().slice(0, 10)}`,
			url: null,
			workspaceId: null,
			occurredAt: null,
			context: "Run started by hand.",
			items: [{ key, text: "" }],
		};
	const [event] =
		await forkAutomationSources(ctx)[rule.options.sourceKind](rule);
	if (!event)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "There is nothing for this automation to act on now",
		});
	return { ...event, key };
}

export const forkJiraAutomationProcedures = {
	automationList: local
		.input(z.object({ connectionId: z.string() }))
		.query(({ ctx, input }) => {
			const rules = ctx.db
				.select()
				.from(forkJiraAutomations)
				.where(
					and(
						eq(forkJiraAutomations.scope, ctx.organizationId),
						eq(forkJiraAutomations.connectionId, input.connectionId),
					),
				)
				.all();
			const counts = ctx.db
				.select({
					ruleId: forkAutomationAttempts.ruleId,
					state: forkAutomationAttempts.state,
				})
				.from(forkAutomationAttempts)
				.where(
					inArray(
						forkAutomationAttempts.ruleId,
						rules.map((rule) => rule.id),
					),
				)
				.all();
			return rules.map((rule) => {
				const own = counts.filter((row) => row.ruleId === rule.id);
				const count = (...states: string[]) =>
					own.filter((row) => states.includes(row.state)).length;
				return {
					...rule,
					options: forkAutomationRule(ctx, rule.id)?.options ?? null,
					launch:
						ctx.db
							.select()
							.from(forkJiraAutomationLaunches)
							.where(eq(forkJiraAutomationLaunches.ruleId, rule.id))
							.get() ?? null,
					attention: count("failed", "unknown", "waiting_input"),
					active: count("queued", "launching", "running", "verifying"),
				};
			});
		}),
	automationCreate: local
		.input(
			z.object({
				connectionId: z.string(),
				projectId: z.string().uuid(),
				name: z.string().trim().min(1).max(200),
				jql: z.string().trim().max(4000),
				agent: z.string().min(1).max(200),
				prompt: z.string().trim().min(1).max(20000),
				launch: forkJiraLaunchSchema.optional(),
				options: ruleOptions.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			checkOptions(input);
			forkServices(ctx).jira.assert(input.connectionId);
			if (
				!ctx.db
					.select({ id: projects.id })
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get()
			)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			const rules = ctx.db
				.select({ id: forkJiraAutomations.id })
				.from(forkJiraAutomations)
				.where(eq(forkJiraAutomations.scope, ctx.organizationId))
				.all();
			if (rules.length >= 100)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "At most 100 automations per host",
				});
			if ((input.options?.sourceKind ?? "jira") === "jira")
				await forkServices(ctx).jira.list(input.connectionId, input.jql);
			if (input.launch)
				await prepareForkJiraLaunch(ctx, input.agent, input.launch);
			const { launch, options, ...fields } = input;
			const rule = {
				...fields,
				id: randomUUID(),
				scope: ctx.organizationId,
				enabled: false,
				initialized: false,
			};
			ctx.db.transaction((tx) => {
				tx.insert(forkJiraAutomations).values(rule).run();
				if (launch)
					tx.insert(forkJiraAutomationLaunches)
						.values({ ruleId: rule.id, ...launch })
						.run();
			});
			if (options) forkSaveAutomationOptions(ctx, rule.id, optionsRow(options));
			return { id: rule.id };
		}),
	automationUpdate: local
		.input(
			id.extend({
				name: z.string().trim().min(1).max(200),
				jql: z.string().trim().max(4000),
				agent: z.string().min(1).max(200),
				prompt: z.string().trim().min(1).max(20000),
				projectId: z.string().uuid(),
				launch: forkJiraLaunchSchema.optional(),
				options: ruleOptions,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const rule = ownedRule(ctx, input.id);
			checkOptions(input);
			if (
				input.options.sourceKind === "jira" &&
				(input.jql !== rule.jql || rule.options.sourceKind !== "jira")
			)
				await forkServices(ctx).jira.list(rule.connectionId, input.jql);
			if (input.launch)
				await prepareForkJiraLaunch(ctx, input.agent, input.launch);
			const sourceChanged =
				input.jql !== rule.jql ||
				input.options.sourceKind !== rule.options.sourceKind ||
				input.options.refire !== rule.options.refire;
			ctx.db.transaction((tx) => {
				tx.update(forkJiraAutomations)
					.set({
						name: input.name,
						jql: input.jql,
						agent: input.agent,
						prompt: input.prompt,
						projectId: input.projectId,
						...(sourceChanged ? { initialized: false } : {}),
					})
					.where(eq(forkJiraAutomations.id, rule.id))
					.run();
				if (input.launch)
					tx.insert(forkJiraAutomationLaunches)
						.values({ ruleId: rule.id, ...input.launch })
						.onConflictDoUpdate({
							target: forkJiraAutomationLaunches.ruleId,
							set: input.launch,
						})
						.run();
			});
			forkSaveAutomationOptions(ctx, rule.id, optionsRow(input.options));
			return { ok: true, baseline: sourceChanged };
		}),
	automationEnable: local
		.input(id.extend({ enabled: z.boolean() }))
		.mutation(({ ctx, input }) => {
			ownedRule(ctx, input.id);
			ctx.db
				.update(forkJiraAutomations)
				.set({ enabled: input.enabled })
				.where(
					and(
						eq(forkJiraAutomations.scope, ctx.organizationId),
						eq(forkJiraAutomations.id, input.id),
					),
				)
				.run();
			if (input.enabled) {
				forkSaveAutomationOptions(ctx, input.id, {
					pausedReason: null,
					failures: 0,
				});
				forkKickAutomations();
			}
			return { ok: true };
		}),
	automationDelete: local.input(id).mutation(({ ctx, input }) => {
		ctx.db
			.delete(forkJiraAutomations)
			.where(
				and(
					eq(forkJiraAutomations.scope, ctx.organizationId),
					eq(forkJiraAutomations.id, input.id),
				),
			)
			.run();
		return { ok: true };
	}),
	/** Kept for released desktop builds; newer ones read automationAttempts. */
	automationRuns: local.input(id).query(({ ctx, input }) =>
		ctx.db
			.select({
				taskKey: forkJiraAutomationRuns.taskKey,
				workspaceId: forkJiraAutomationRuns.workspaceId,
				error: forkJiraAutomationRuns.error,
				createdAt: forkJiraAutomationRuns.createdAt,
			})
			.from(forkJiraAutomationRuns)
			.innerJoin(
				forkJiraAutomations,
				eq(forkJiraAutomations.id, forkJiraAutomationRuns.ruleId),
			)
			.where(
				and(
					eq(forkJiraAutomations.scope, ctx.organizationId),
					eq(forkJiraAutomations.id, input.id),
				),
			)
			.orderBy(desc(forkJiraAutomationRuns.createdAt))
			.limit(20)
			.all(),
	),
	automationAttempts: local
		.input(z.object({ id: z.string().uuid().optional() }))
		.query(({ ctx, input }) => {
			const rules = new Map(
				ctx.db
					.select({
						id: forkJiraAutomations.id,
						name: forkJiraAutomations.name,
					})
					.from(forkJiraAutomations)
					.where(eq(forkJiraAutomations.scope, ctx.organizationId))
					.all()
					.map((rule) => [rule.id, rule.name]),
			);
			if (rules.size === 0) return [];
			return ctx.db
				.select()
				.from(forkAutomationAttempts)
				.where(
					input.id
						? eq(forkAutomationAttempts.ruleId, input.id)
						: inArray(forkAutomationAttempts.ruleId, [...rules.keys()]),
				)
				.orderBy(desc(forkAutomationAttempts.createdAt))
				.limit(input.id ? 30 : 100)
				.all()
				.filter((attempt) => rules.has(attempt.ruleId))
				.map(({ prompt: _prompt, ...attempt }) => ({
					...attempt,
					ruleName: rules.get(attempt.ruleId) ?? "",
				}));
		}),
	automationAttemptAction: local
		.input(
			z.object({
				attemptId: z.string().uuid(),
				action: z.enum(["retry", "cancel", "verified", "release"]),
			}),
		)
		.mutation(({ ctx, input }) => {
			const attempt = ownedAttempt(ctx, input.attemptId);
			const now = Date.now();
			const refuse = (message: string): never => {
				throw new TRPCError({ code: "BAD_REQUEST", message });
			};
			if (input.action === "retry") {
				if (
					!["failed", "unknown", "cancelled", "skipped", "agent_done"].includes(
						attempt.state,
					)
				)
					refuse("This run cannot be run again now");
				const created = forkRetryAutomationAttempt(
					ctx,
					{ ...attempt, manual: true },
					now,
				);
				forkKickAutomations();
				return { id: created };
			}
			if (input.action === "cancel" && attempt.state !== "queued")
				refuse("Only runs waiting in the queue can be cancelled");
			if (
				input.action === "verified" &&
				!["agent_done", "unknown"].includes(attempt.state)
			)
				refuse("Only a finished run can be marked as verified");
			if (
				input.action === "release" &&
				!["running", "waiting_input", "verifying"].includes(attempt.state)
			)
				refuse("This run is not in progress");
			ctx.db
				.update(forkAutomationAttempts)
				.set({
					state:
						input.action === "cancel"
							? "cancelled"
							: input.action === "verified"
								? "verified"
								: "unknown",
					...(input.action === "release"
						? {
								error:
									"You stopped tracking this run. The agent may still be working in its workspace.",
							}
						: {}),
					nextAttemptAt: null,
					updatedAt: now,
				})
				.where(eq(forkAutomationAttempts.id, attempt.id))
				.run();
			if (input.action === "release") forkKickAutomations();
			return { id: attempt.id };
		}),
	automationPreview: local.input(id).query(async ({ ctx, input }) => {
		const rule = ownedRule(ctx, input.id);
		const events =
			await forkAutomationSources(ctx)[rule.options.sourceKind](rule);
		return forkPreviewAutomationEvents(ctx, rule, events, Date.now()).slice(
			0,
			50,
		);
	}),
	automationRunNow: local
		.input(
			id.extend({
				taskKey: z
					.string()
					.regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/)
					.optional(),
				dryRun: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const rule = ownedRule(ctx, input.id);
			const event = await manualEvent(ctx, rule, input.taskKey);
			if (input.dryRun) {
				return {
					dryRun: true as const,
					title: event.title,
					prompt: forkAutomationPrompt(rule, event),
					workspaceId: event.workspaceId,
				};
			}
			const attemptId = forkQueueAutomationEvent(ctx, rule, event, {
				now: Date.now(),
				manual: true,
			});
			forkKickAutomations();
			return { dryRun: false as const, attemptId };
		}),
	automationSettings: local.query(({ ctx }) => forkAutomationLimits(ctx)),
	automationSaveSettings: local
		.input(
			z.object({
				maxRunning: z.number().int().min(1).max(10),
				maxPerProject: z.number().int().min(1).max(10),
			}),
		)
		.mutation(({ ctx, input }) => {
			ctx.db
				.insert(forkAutomationSettings)
				.values({ scope: ctx.organizationId, ...input })
				.onConflictDoUpdate({
					target: forkAutomationSettings.scope,
					set: input,
				})
				.run();
			forkKickAutomations();
			return { ok: true };
		}),
};
