import { execFile } from "node:child_process";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
	type ForkAutomationAttemptState,
	forkAutomationAttempts,
	forkAutomationRuleOptions,
} from "../db/fork-schema";
import type { AgentLifecycleEventType } from "../events";
import type { HostServiceContext } from "../types";
import { getLocalWorkspace } from "../workspaces/local-workspace-store";

type Ctx = Pick<HostServiceContext, "db">;

export type ForkVerifier = (
	cwd: string,
	command: string,
) => Promise<{ ok: boolean; output: string }>;

const VERIFY_TIMEOUT_MS = 10 * 60_000;
const OUTPUT_LIMIT = 4000;

export const forkRunVerification: ForkVerifier = (cwd, command) =>
	new Promise((resolve) => {
		execFile(
			"/bin/sh",
			["-lc", command],
			{ cwd, timeout: VERIFY_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const output = `${stdout}${stderr}`.slice(-OUTPUT_LIMIT);
				resolve({ ok: !error, output });
			},
		);
	});

const TRACKED: ForkAutomationAttemptState[] = [
	"launching",
	"running",
	"waiting_input",
	"agent_done",
];

const NEXT_STATE: Partial<
	Record<AgentLifecycleEventType, ForkAutomationAttemptState>
> = {
	Start: "running",
	PermissionRequest: "waiting_input",
	Stop: "agent_done",
	Failed: "failed",
};

/**
 * Follows the agent of an automation run. "Stop" ends a turn, not the task:
 * the run becomes "agent done" and stays open until a check or the user
 * confirms it.
 */
export function forkAutomationLifecycle(
	ctx: Ctx,
	event: {
		workspaceId: string;
		terminalId: string;
		eventType: AgentLifecycleEventType;
		occurredAt: number;
	},
	verify: ForkVerifier = forkRunVerification,
): Promise<void> | undefined {
	const state = NEXT_STATE[event.eventType];
	if (!state) return;
	const attempt = ctx.db
		.select()
		.from(forkAutomationAttempts)
		.where(
			and(
				inArray(forkAutomationAttempts.state, TRACKED),
				or(
					eq(forkAutomationAttempts.terminalId, event.terminalId),
					and(
						isNull(forkAutomationAttempts.terminalId),
						eq(forkAutomationAttempts.workspaceId, event.workspaceId),
						eq(forkAutomationAttempts.state, "launching"),
					),
				),
			),
		)
		.get();
	if (!attempt) return;
	ctx.db
		.update(forkAutomationAttempts)
		.set({
			state,
			terminalId: attempt.terminalId ?? event.terminalId,
			updatedAt: event.occurredAt,
			...(state === "failed" ? { error: "The agent reported an error." } : {}),
		})
		.where(eq(forkAutomationAttempts.id, attempt.id))
		.run();
	if (state !== "agent_done") return;
	const command = ctx.db
		.select({ verifyCommand: forkAutomationRuleOptions.verifyCommand })
		.from(forkAutomationRuleOptions)
		.where(eq(forkAutomationRuleOptions.ruleId, attempt.ruleId))
		.get()?.verifyCommand;
	if (!command?.trim() || !attempt.workspaceId) return;
	const workspace = getLocalWorkspace(ctx.db, attempt.workspaceId);
	if (!workspace) return;
	ctx.db
		.update(forkAutomationAttempts)
		.set({ state: "verifying" })
		.where(eq(forkAutomationAttempts.id, attempt.id))
		.run();
	return verify(workspace.worktreePath, command).then(({ ok, output }) => {
		ctx.db
			.update(forkAutomationAttempts)
			.set({
				state: ok ? "verified" : "agent_done",
				verifyOutput: output,
				error: ok ? null : "The verification command failed.",
				updatedAt: Date.now(),
			})
			.where(
				and(
					eq(forkAutomationAttempts.id, attempt.id),
					eq(forkAutomationAttempts.state, "verifying"),
				),
			)
			.run();
	});
}

/** Best effort: an automation bookkeeping error never fails the agent event. */
export function forkTrackAutomationLifecycle(
	ctx: Ctx,
	event: Parameters<typeof forkAutomationLifecycle>[1],
): void {
	try {
		void forkAutomationLifecycle(ctx, event)?.catch((error) =>
			console.warn("[fork-automations] verification failed", error),
		);
	} catch (error) {
		console.warn("[fork-automations] could not track the agent", error);
	}
}
