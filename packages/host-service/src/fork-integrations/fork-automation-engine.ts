import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, lte, notInArray } from "drizzle-orm";
import {
	type ForkAutomationAttemptState,
	type ForkAutomationSourceKind,
	forkAutomationAttempts,
	forkAutomationRuleOptions,
	forkAutomationSeen,
	forkAutomationSettings,
	forkJiraAutomationRuns,
	forkJiraAutomations,
} from "../db/fork-schema";
import type { HostServiceContext } from "../types";
import {
	FORK_EXTERNAL_DATA_NOTE,
	type ForkAutomationEvent,
	type ForkAutomationRule,
	type ForkAutomationSource,
} from "./fork-automation-sources";

type Ctx = Pick<HostServiceContext, "db" | "organizationId">;
type Attempt = typeof forkAutomationAttempts.$inferSelect;

export const FORK_AUTOMATION_ACTIVE_STATES: ForkAutomationAttemptState[] = [
	"launching",
	"running",
	"waiting_input",
];
/** New runs one rule may queue per scan; the rest wait for the next scan. */
export const FORK_AUTOMATION_SCAN_LIMIT = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const PAUSE_AFTER_FAILURES = 3;

export interface ForkAutomationLaunchResult {
	workspaceId: string;
	terminalId: string | null;
}

export interface ForkAutomationDeps {
	now: () => number;
	sources: Partial<Record<ForkAutomationSourceKind, ForkAutomationSource>>;
	launch: (
		rule: ForkAutomationRule,
		attempt: Attempt,
	) => Promise<ForkAutomationLaunchResult>;
	stopped?: () => boolean;
}

export function forkAutomationRules(ctx: Ctx): ForkAutomationRule[] {
	return ctx.db
		.select()
		.from(forkJiraAutomations)
		.leftJoin(
			forkAutomationRuleOptions,
			eq(forkAutomationRuleOptions.ruleId, forkJiraAutomations.id),
		)
		.where(eq(forkJiraAutomations.scope, ctx.organizationId))
		.all()
		.map((row) => ({
			...row.fork_jira_automations,
			options: row.fork_automation_rule_options ?? {
				ruleId: row.fork_jira_automations.id,
				sourceKind: "jira",
				sourceConfig: {},
				refire: "never",
				catchupMinutes: 120,
				verifyCommand: null,
				retryLimit: 3,
				targetLimit: null,
				pausedReason: null,
				failures: 0,
			},
		}));
}

export function forkAutomationRule(
	ctx: Ctx,
	id: string,
): ForkAutomationRule | null {
	return forkAutomationRules(ctx).find((rule) => rule.id === id) ?? null;
}

export function forkAutomationLimits(ctx: Ctx): {
	maxRunning: number;
	maxPerProject: number;
} {
	const row = ctx.db
		.select()
		.from(forkAutomationSettings)
		.where(eq(forkAutomationSettings.scope, ctx.organizationId))
		.get();
	return {
		maxRunning: row?.maxRunning ?? 2,
		maxPerProject: row?.maxPerProject ?? 1,
	};
}

function saveOptions(
	ctx: Ctx,
	ruleId: string,
	patch: Partial<typeof forkAutomationRuleOptions.$inferInsert>,
): void {
	ctx.db
		.insert(forkAutomationRuleOptions)
		.values({ ruleId, ...patch })
		.onConflictDoUpdate({
			target: forkAutomationRuleOptions.ruleId,
			set: patch,
		})
		.run();
}

export function forkSaveAutomationOptions(
	ctx: Ctx,
	ruleId: string,
	patch: Partial<typeof forkAutomationRuleOptions.$inferInsert>,
): void {
	saveOptions(ctx, ruleId, patch);
}

function legacyClaimed(ruleId: string, ctx: Ctx, taskId: string): boolean {
	return !!ctx.db
		.select({ taskId: forkJiraAutomationRuns.taskId })
		.from(forkJiraAutomationRuns)
		.where(
			and(
				eq(forkJiraAutomationRuns.ruleId, ruleId),
				eq(forkJiraAutomationRuns.taskId, taskId),
			),
		)
		.get();
}

function isSeen(ctx: Ctx, rule: ForkAutomationRule, key: string): boolean {
	if (
		ctx.db
			.select({ key: forkAutomationSeen.itemKey })
			.from(forkAutomationSeen)
			.where(
				and(
					eq(forkAutomationSeen.ruleId, rule.id),
					eq(forkAutomationSeen.itemKey, key),
				),
			)
			.get()
	)
		return true;
	return rule.options.sourceKind === "jira" && legacyClaimed(rule.id, ctx, key);
}

/** Records keys as handled; returns the ones this call recorded first. */
function markSeen(
	ctx: Ctx,
	rule: ForkAutomationRule,
	keys: string[],
	now: number,
): string[] {
	return keys.filter(
		(key) =>
			ctx.db
				.insert(forkAutomationSeen)
				.values({ ruleId: rule.id, itemKey: key, createdAt: now })
				.onConflictDoNothing()
				.run().changes > 0,
	);
}

/** Keeps the previous host build from starting the issue again after a downgrade. */
function legacyClaim(
	ctx: Ctx,
	rule: ForkAutomationRule,
	event: ForkAutomationEvent,
	now: number,
): void {
	if (rule.options.sourceKind !== "jira" || !event.jira) return;
	ctx.db
		.insert(forkJiraAutomationRuns)
		.values({
			ruleId: rule.id,
			taskId: event.jira.id,
			taskKey: event.jira.key,
			workspaceId: null,
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();
}

export function forkAutomationPrompt(
	rule: Pick<ForkAutomationRule, "prompt">,
	event: ForkAutomationEvent,
	items = event.items,
): string {
	const details = items
		.map((item) => item.text)
		.filter(Boolean)
		.join("\n\n");
	return [rule.prompt, FORK_EXTERNAL_DATA_NOTE, event.context, details]
		.filter(Boolean)
		.join("\n\n");
}

function insertAttempt(
	ctx: Ctx,
	values: Omit<
		typeof forkAutomationAttempts.$inferInsert,
		"id" | "createdAt" | "updatedAt"
	>,
	now: number,
): string {
	const id = randomUUID();
	ctx.db
		.insert(forkAutomationAttempts)
		.values({ ...values, id, createdAt: now, updatedAt: now })
		.run();
	return id;
}

export function forkQueueAutomationEvent(
	ctx: Ctx,
	rule: ForkAutomationRule,
	event: ForkAutomationEvent,
	options: {
		now: number;
		manual?: boolean;
		items?: ForkAutomationEvent["items"];
	},
): string {
	return insertAttempt(
		ctx,
		{
			ruleId: rule.id,
			eventKey: event.key,
			target: event.target,
			title: event.title,
			url: event.url,
			prompt: forkAutomationPrompt(rule, event, options.items),
			workspaceId: event.workspaceId,
			state: "queued",
			manual: options.manual ?? false,
		},
		options.now,
	);
}

function targetCount(ctx: Ctx, ruleId: string, target: string): number {
	return ctx.db
		.select({ id: forkAutomationAttempts.id })
		.from(forkAutomationAttempts)
		.where(
			and(
				eq(forkAutomationAttempts.ruleId, ruleId),
				eq(forkAutomationAttempts.target, target),
				notInArray(forkAutomationAttempts.state, [
					"skipped",
					"failed",
					"retried",
					"cancelled",
				]),
			),
		)
		.all().length;
}

export type ForkAutomationPreviewStatus =
	| "start"
	| "handled"
	| "baseline"
	| "limit"
	| "missed";

/** What a scan would do with each event, without changing anything. */
export function forkPreviewAutomationEvents(
	ctx: Ctx,
	rule: ForkAutomationRule,
	events: ForkAutomationEvent[],
	now: number,
): {
	key: string;
	title: string;
	url: string | null;
	status: ForkAutomationPreviewStatus;
}[] {
	return events.map((event) => {
		const fresh = event.items.filter((item) => !isSeen(ctx, rule, item.key));
		const status: ForkAutomationPreviewStatus =
			fresh.length === 0
				? "handled"
				: !rule.initialized && rule.options.sourceKind !== "schedule"
					? "baseline"
					: event.target &&
							rule.options.targetLimit &&
							targetCount(ctx, rule.id, event.target) >=
								rule.options.targetLimit
						? "limit"
						: event.occurredAt !== null &&
								now - event.occurredAt > rule.options.catchupMinutes * 60_000
							? "missed"
							: "start";
		return { key: event.key, title: event.title, url: event.url, status };
	});
}

async function scanRule(
	ctx: Ctx,
	rule: ForkAutomationRule,
	deps: ForkAutomationDeps,
): Promise<void> {
	const source = deps.sources[rule.options.sourceKind];
	if (!source) return;
	const stillEnabled = () =>
		!!ctx.db
			.select({ id: forkJiraAutomations.id })
			.from(forkJiraAutomations)
			.where(
				and(
					eq(forkJiraAutomations.id, rule.id),
					eq(forkJiraAutomations.enabled, true),
				),
			)
			.get();
	try {
		const events = await source(rule);
		if (!stillEnabled() || deps.stopped?.()) return;
		const now = deps.now();
		const baseline =
			!rule.initialized && rule.options.sourceKind !== "schedule";
		let queued = 0;
		for (const event of events) {
			if (deps.stopped?.() || !stillEnabled()) break;
			const fresh = event.items.filter((item) => !isSeen(ctx, rule, item.key));
			if (fresh.length === 0) continue;
			if (baseline) {
				markSeen(
					ctx,
					rule,
					fresh.map((item) => item.key),
					now,
				);
				legacyClaim(ctx, rule, event, now);
				continue;
			}
			if (queued >= FORK_AUTOMATION_SCAN_LIMIT) break;
			const recorded = new Set(
				markSeen(
					ctx,
					rule,
					fresh.map((item) => item.key),
					now,
				),
			);
			const items = fresh.filter((item) => recorded.has(item.key));
			if (items.length === 0) continue;
			legacyClaim(ctx, rule, event, now);
			const skip =
				event.target &&
				rule.options.targetLimit &&
				targetCount(ctx, rule.id, event.target) >= rule.options.targetLimit
					? "This target reached the rule's run limit."
					: event.occurredAt !== null &&
							now - event.occurredAt > rule.options.catchupMinutes * 60_000
						? "Skipped: the computer was off or asleep when this run was due."
						: null;
			const id = forkQueueAutomationEvent(ctx, rule, event, { now, items });
			if (skip)
				ctx.db
					.update(forkAutomationAttempts)
					.set({ state: "skipped", error: skip })
					.where(eq(forkAutomationAttempts.id, id))
					.run();
			else queued++;
		}
		ctx.db
			.update(forkJiraAutomations)
			.set({ initialized: true, checkedAt: now, error: null })
			.where(eq(forkJiraAutomations.id, rule.id))
			.run();
	} catch (error) {
		ctx.db
			.update(forkJiraAutomations)
			.set({
				checkedAt: deps.now(),
				error: error instanceof Error ? error.message : String(error),
			})
			.where(eq(forkJiraAutomations.id, rule.id))
			.run();
	}
}

export async function forkScanAutomations(
	ctx: Ctx,
	deps: ForkAutomationDeps,
): Promise<void> {
	for (const rule of forkAutomationRules(ctx)) {
		if (deps.stopped?.()) return;
		if (!rule.enabled || rule.options.pausedReason) continue;
		await scanRule(ctx, rule, deps);
	}
}

/** Queues the automatic retry of failed launches whose delay has passed. */
export function forkRetryDueAutomations(ctx: Ctx, now: number): void {
	const due = ctx.db
		.select()
		.from(forkAutomationAttempts)
		.innerJoin(
			forkJiraAutomations,
			eq(forkJiraAutomations.id, forkAutomationAttempts.ruleId),
		)
		.where(
			and(
				eq(forkJiraAutomations.scope, ctx.organizationId),
				eq(forkAutomationAttempts.state, "failed"),
				lte(forkAutomationAttempts.nextAttemptAt, now),
			),
		)
		.all();
	for (const { fork_automation_attempts: attempt } of due) {
		const claimed = ctx.db
			.update(forkAutomationAttempts)
			.set({ nextAttemptAt: null, updatedAt: now })
			.where(
				and(
					eq(forkAutomationAttempts.id, attempt.id),
					isNotNull(forkAutomationAttempts.nextAttemptAt),
				),
			)
			.run();
		if (claimed.changes === 0) continue;
		forkRetryAutomationAttempt(ctx, attempt, now, attempt.retryCount + 1);
	}
}

export function forkRetryAutomationAttempt(
	ctx: Ctx,
	attempt: Attempt,
	now: number,
	retryCount = 0,
): string {
	ctx.db
		.update(forkAutomationAttempts)
		.set({ state: "retried", nextAttemptAt: null, updatedAt: now })
		.where(eq(forkAutomationAttempts.id, attempt.id))
		.run();
	return insertAttempt(
		ctx,
		{
			ruleId: attempt.ruleId,
			eventKey: attempt.eventKey,
			target: attempt.target,
			title: attempt.title,
			url: attempt.url,
			prompt: attempt.prompt,
			workspaceId: attempt.workspaceId,
			state: "queued",
			previousAttemptId: attempt.id,
			retryCount,
			manual: attempt.manual,
		},
		now,
	);
}

function activeCounts(ctx: Ctx, rules: Map<string, ForkAutomationRule>) {
	const active = ctx.db
		.select({ ruleId: forkAutomationAttempts.ruleId })
		.from(forkAutomationAttempts)
		.where(inArray(forkAutomationAttempts.state, FORK_AUTOMATION_ACTIVE_STATES))
		.all()
		.filter((row) => rules.has(row.ruleId));
	const perProject = new Map<string, number>();
	for (const row of active) {
		const project = rules.get(row.ruleId)?.projectId ?? "";
		perProject.set(project, (perProject.get(project) ?? 0) + 1);
	}
	return { total: active.length, perProject };
}

function recordFailure(
	ctx: Ctx,
	rule: ForkAutomationRule,
	attempt: Attempt,
	message: string,
	now: number,
): void {
	const retry =
		!attempt.manual && attempt.retryCount + 1 < rule.options.retryLimit;
	ctx.db
		.update(forkAutomationAttempts)
		.set({
			state: "failed",
			error: message,
			nextAttemptAt: retry
				? now +
					(RETRY_DELAYS_MS[attempt.retryCount] ??
						RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ??
						60_000)
				: null,
			updatedAt: now,
		})
		.where(eq(forkAutomationAttempts.id, attempt.id))
		.run();
	const failures = rule.options.failures + 1;
	const pausedReason =
		failures >= PAUSE_AFTER_FAILURES
			? `Paused after ${failures} failed launches in a row. Last error: ${message}`
			: null;
	saveOptions(ctx, rule.id, {
		failures,
		...(pausedReason ? { pausedReason } : {}),
	});
	rule.options.failures = failures;
	if (pausedReason) rule.options.pausedReason = pausedReason;
}

/** Starts queued runs while the global and per-project limits allow. */
export async function forkDispatchAutomations(
	ctx: Ctx,
	deps: ForkAutomationDeps,
): Promise<void> {
	const rules = new Map(
		forkAutomationRules(ctx).map((rule) => [rule.id, rule]),
	);
	const limits = forkAutomationLimits(ctx);
	const queued = ctx.db
		.select()
		.from(forkAutomationAttempts)
		.where(eq(forkAutomationAttempts.state, "queued"))
		.orderBy(asc(forkAutomationAttempts.createdAt))
		.all()
		.filter((attempt) => rules.has(attempt.ruleId));
	for (const attempt of queued) {
		if (deps.stopped?.()) return;
		const rule = rules.get(attempt.ruleId);
		if (!rule) continue;
		if (!attempt.manual && (!rule.enabled || rule.options.pausedReason))
			continue;
		const counts = activeCounts(ctx, rules);
		if (counts.total >= limits.maxRunning) return;
		if ((counts.perProject.get(rule.projectId) ?? 0) >= limits.maxPerProject)
			continue;
		const now = deps.now();
		const claimed = ctx.db
			.update(forkAutomationAttempts)
			.set({ state: "launching", updatedAt: now })
			.where(
				and(
					eq(forkAutomationAttempts.id, attempt.id),
					eq(forkAutomationAttempts.state, "queued"),
				),
			)
			.run();
		if (claimed.changes === 0) continue;
		const workspaceId = attempt.workspaceId ?? randomUUID();
		ctx.db
			.update(forkAutomationAttempts)
			.set({ workspaceId })
			.where(eq(forkAutomationAttempts.id, attempt.id))
			.run();
		try {
			const result = await deps.launch(rule, {
				...attempt,
				workspaceId,
				state: "launching",
			});
			const done = deps.now();
			ctx.db
				.update(forkAutomationAttempts)
				.set({
					workspaceId: result.workspaceId,
					...(result.terminalId ? { terminalId: result.terminalId } : {}),
					updatedAt: done,
				})
				.where(eq(forkAutomationAttempts.id, attempt.id))
				.run();
			ctx.db
				.update(forkAutomationAttempts)
				.set({ state: "running" })
				.where(
					and(
						eq(forkAutomationAttempts.id, attempt.id),
						eq(forkAutomationAttempts.state, "launching"),
					),
				)
				.run();
			if (rule.options.failures > 0) {
				saveOptions(ctx, rule.id, { failures: 0 });
				rule.options.failures = 0;
			}
		} catch (error) {
			recordFailure(
				ctx,
				rule,
				{ ...attempt, workspaceId },
				error instanceof Error ? error.message : String(error),
				deps.now(),
			);
		}
	}
}

/**
 * A host that stopped cannot know how a run ended: it missed the agent's
 * events. Such runs become "to check" so they stop holding a concurrency slot.
 */
export function forkRecoverAutomations(ctx: Ctx, now: number): void {
	const rules = new Set(forkAutomationRules(ctx).map((rule) => rule.id));
	for (const attempt of ctx.db
		.select()
		.from(forkAutomationAttempts)
		.where(
			inArray(forkAutomationAttempts.state, [
				...FORK_AUTOMATION_ACTIVE_STATES,
				"verifying",
			]),
		)
		.all()) {
		if (!rules.has(attempt.ruleId)) continue;
		ctx.db
			.update(forkAutomationAttempts)
			.set({
				state: "unknown",
				error:
					"Superset stopped while this run was in progress. Check the workspace before you run it again.",
				updatedAt: now,
			})
			.where(eq(forkAutomationAttempts.id, attempt.id))
			.run();
	}
}

export async function forkRunAutomationTick(
	ctx: Ctx,
	deps: ForkAutomationDeps,
): Promise<void> {
	await forkScanAutomations(ctx, deps);
	if (deps.stopped?.()) return;
	forkRetryDueAutomations(ctx, deps.now());
	await forkDispatchAutomations(ctx, deps);
}
