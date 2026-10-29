import { forkTaskBranch } from "@superset/shared/fork-integrations";
import { eq } from "drizzle-orm";
import {
	type forkAutomationAttempts,
	forkJiraAutomationLaunches,
} from "../db/fork-schema";
import { workspacesRouter } from "../trpc/router/workspaces/workspaces";
import type { HostServiceContext } from "../types";
import { getLocalWorkspace } from "../workspaces/local-workspace-store";
import {
	type ForkAutomationDeps,
	type ForkAutomationLaunchResult,
	forkRecoverAutomations,
	forkRunAutomationTick,
} from "./fork-automation-engine";
import {
	type ForkAutomationRule,
	forkAutomationSources,
} from "./fork-automation-sources";
import { launchForkJiraAgent, prepareForkJiraLaunch } from "./fork-jira-launch";
import { forkAdvanceLinkedTasks, forkLinkTask } from "./fork-jira-workflow";
import { forkServices } from "./fork-services";

type Attempt = typeof forkAutomationAttempts.$inferSelect;

function slug(value: string): string {
	return (
		value
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 40) || "run"
	);
}

/** Creates or reuses the run's workspace, then starts the rule's agent in it. */
export async function forkLaunchAutomationAttempt(
	ctx: HostServiceContext,
	rule: ForkAutomationRule,
	attempt: Attempt,
	stopped: () => boolean = () => false,
): Promise<ForkAutomationLaunchResult> {
	const options = ctx.db
		.select()
		.from(forkJiraAutomationLaunches)
		.where(eq(forkJiraAutomationLaunches.ruleId, rule.id))
		.get();
	const launch = options
		? await prepareForkJiraLaunch(ctx, rule.agent, {
				surface: options.surface,
				model: options.model ?? undefined,
				accountSelection: options.accountSelection ?? undefined,
			})
		: {};
	const workspaceId = attempt.workspaceId;
	if (!workspaceId) throw new Error("The run has no workspace");
	const existing = getLocalWorkspace(ctx.db, workspaceId);
	if (existing?.archivedAt)
		throw new Error("The workspace for this run is archived");
	let prompt = attempt.prompt;
	const jiraTask =
		rule.options.sourceKind === "jira" && attempt.target
			? await forkServices(ctx).jira.get(rule.connectionId, attempt.target)
			: null;
	if (jiraTask?.description) prompt = `${prompt}\n\n${jiraTask.description}`;
	if (stopped()) throw new Error("Host is stopping");
	if (!existing) {
		const day = new Date().toISOString().slice(0, 10);
		const created = await workspacesRouter.createCaller(ctx).create({
			id: workspaceId,
			projectId: rule.projectId,
			name: jiraTask ? `${jiraTask.key} ${jiraTask.title}` : attempt.title,
			branch: jiraTask
				? forkTaskBranch(jiraTask.key, jiraTask.title, jiraTask.type?.name)
				: `automation/${slug(rule.name)}-${day}-${attempt.id.slice(0, 6)}`,
			tags: ["automation", rule.options.sourceKind],
		});
		if (jiraTask)
			forkLinkTask(ctx, created.workspace.id, {
				connectionId: rule.connectionId,
				taskId: jiraTask.id,
				key: jiraTask.key,
				title: jiraTask.title,
				url: jiraTask.url,
			});
	}
	if (stopped()) throw new Error("Host is stopping");
	const result = await launchForkJiraAgent(ctx, {
		...launch,
		workspaceId,
		agent: rule.agent,
		prompt,
	});
	if (jiraTask) await forkAdvanceLinkedTasks(ctx, workspaceId, "progress");
	return { workspaceId, terminalId: result.sessionId };
}

let kick: (() => void) | null = null;

/** Runs a check now instead of waiting for the next minute. */
export function forkKickAutomations(): void {
	kick?.();
}

export function forkAutomationDeps(
	ctx: HostServiceContext,
	stopped: () => boolean,
): ForkAutomationDeps {
	return {
		now: Date.now,
		stopped,
		sources: forkAutomationSources(ctx),
		launch: (rule, attempt) =>
			forkLaunchAutomationAttempt(ctx, rule, attempt, stopped),
	};
}

export function startForkJiraAutomations(ctx: HostServiceContext) {
	let stopped = false;
	let running: Promise<void> | null = null;
	let again = false;
	forkRecoverAutomations(ctx, Date.now());
	const deps = forkAutomationDeps(ctx, () => stopped);
	const tick = () => {
		if (stopped) return;
		if (running) {
			again = true;
			return;
		}
		running = forkRunAutomationTick(ctx, deps)
			.catch((error) => console.warn("[fork-automations] check failed", error))
			.finally(() => {
				running = null;
				if (again && !stopped) {
					again = false;
					tick();
				}
			});
	};
	kick = tick;
	const timer = setInterval(tick, 60_000);
	timer.unref();
	tick();
	return async () => {
		stopped = true;
		kick = null;
		clearInterval(timer);
		await running;
	};
}
