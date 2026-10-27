import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatRuntime } from "@superset/chat-runtime";
import { TRPCError } from "@trpc/server";
import { agentAccountOptions } from "../trpc/router/agents/account-selection";
import { assertIsolatedAccount } from "../trpc/router/usage/fork-isolated-accounts";
import { discoverClaudeProfiles } from "../trpc/router/usage/profiles";
import type { HostServiceContext } from "../types";
import { moveClaudeSession } from "./forkMoveClaudeSession";
import { writeRecovery } from "./forkQuotaRecoveryStore";

export interface ForkSwitchChatAccountInput {
	workspaceId: string;
	terminalId: string;
	chatSessionId: string;
	sessionId: string;
	targetSelection: string | null;
}

export type ForkSwitchChatAccountResult =
	| { switched: true; sessionId: string; moved: boolean }
	| { switched: false; sessionId: string; moved: false; error: string };

type SwitchDependencies = {
	validateTarget(): Promise<void>;
	move(): Promise<{ moved: boolean }>;
	clearRecovery(): void;
	now?: () => number;
	wait?: (ms: number) => Promise<void>;
	graceMs?: number;
	readinessMs?: number;
};

const switching = new WeakMap<ChatRuntime, Set<string>>();

export async function forkSwitchChatAccount(
	runtime: ChatRuntime,
	input: ForkSwitchChatAccountInput,
	deps: SwitchDependencies,
): Promise<ForkSwitchChatAccountResult> {
	let pending = switching.get(runtime);
	if (!pending) {
		pending = new Set();
		switching.set(runtime, pending);
	}
	if (pending.has(input.sessionId))
		throw new TRPCError({
			code: "CONFLICT",
			message: "account_switch_in_progress",
		});
	pending.add(input.sessionId);
	try {
		const live = runtime.live.get(input.chatSessionId);
		if (
			!live ||
			live.scopeId !== input.workspaceId ||
			live.terminalId !== input.terminalId ||
			live.harness !== "claude-acp" ||
			live.state.harnessSessionId !== input.sessionId
		)
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "chat_account_source_changed",
			});
		await deps.validateTarget();
		const launch = live.launchOptions;
		if (
			!launch ||
			runtime.live.get(input.chatSessionId) !== live ||
			live.state.harnessSessionId !== input.sessionId
		)
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "chat_account_source_changed",
			});
		const modeId = live.state.modeId ?? launch.modeId;
		const modelId = live.state.modelId ?? launch.modelId;
		live.cancelTurn(undefined, true);
		const now = deps.now ?? Date.now;
		const wait =
			deps.wait ??
			((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
		const deadline = now() + (deps.graceMs ?? 1500);
		while (
			now() < deadline &&
			(live.turn?.status === "running" ||
				live.state.status === "awaiting_input")
		)
			await wait(Math.min(50, deadline - now()));
		const pausedPrompts = live.queueState.prompts.map(
			(prompt) => prompt.content,
		);
		const stop = async (sessionId: string) => {
			try {
				await runtime.commands.closeSession({ sessionId });
			} catch (cause) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "chat_account_stop_unconfirmed",
					cause,
				});
			}
		};
		const awaitReady = async (sessionId: string) => {
			const readyBy = now() + (deps.readinessMs ?? 10_000);
			while (true) {
				const current = runtime.live.get(sessionId);
				if (!current || current.state.status === "dead")
					throw new Error("chat_account_bootstrap_failed");
				if (current.state.status === "idle") {
					if (current.state.harnessSessionId !== input.sessionId)
						throw new Error("chat_account_resume_mismatch");
					return;
				}
				if (now() >= readyBy) throw new Error("chat_account_bootstrap_timeout");
				await wait(Math.min(50, readyBy - now()));
			}
		};
		await stop(input.chatSessionId);
		const reopen = async (accountSelection: string | null | undefined) => {
			const created = runtime.commands.createSession({
				...launch,
				commandId: randomUUID(),
				modeId,
				modelId,
				accountSelection,
				strictResume: true,
				resume: { harnessSessionId: input.sessionId },
			});
			try {
				runtime.live
					.require(created.sessionId)
					.promptOnceStarted([], pausedPrompts);
				await awaitReady(created.sessionId);
			} catch (error) {
				await stop(created.sessionId);
				return { ready: false as const, error };
			}
			return { ready: true as const, sessionId: created.sessionId };
		};
		const recover = async (
			error: unknown,
		): Promise<ForkSwitchChatAccountResult> => {
			const source = await reopen(launch.accountSelection);
			if (!source.ready)
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "chat_account_recovery_failed",
					cause: source.error,
				});
			return {
				switched: false,
				sessionId: source.sessionId,
				moved: false,
				error: error instanceof Error ? error.message : String(error),
			};
		};
		let moved: { moved: boolean };
		try {
			moved = await deps.move();
			deps.clearRecovery();
		} catch (error) {
			return await recover(error);
		}
		const target = await reopen(input.targetSelection);
		if (!target.ready) return await recover(target.error);
		return {
			switched: true,
			sessionId: target.sessionId,
			moved: moved.moved,
		};
	} finally {
		pending.delete(input.sessionId);
	}
}

export async function switchClaudeChatAccount(
	ctx: HostServiceContext,
	input: ForkSwitchChatAccountInput,
): Promise<ForkSwitchChatAccountResult> {
	const runtime = ctx.runtime.chat?.();
	if (!runtime)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "chat_runtime_unavailable",
		});
	const systemDir = join(homedir(), ".claude");
	return forkSwitchChatAccount(runtime, input, {
		validateTarget: async () => {
			if (input.targetSelection !== null)
				await assertIsolatedAccount("claude", input.targetSelection);
			const options = await agentAccountOptions("claude");
			if (!options.some((option) => option.selection === input.targetSelection))
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "account_selection_unavailable",
				});
		},
		move: async () => {
			const result = await moveClaudeSession({
				sessionId: input.sessionId,
				configDirs: [
					systemDir,
					...(await discoverClaudeProfiles()).map(
						(profile) => profile.configDir,
					),
				],
				targetDir: input.targetSelection ?? systemDir,
			});
			if (!result.moved && result.reason === "session_not_found")
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "session_not_found",
				});
			return result;
		},
		clearRecovery: () =>
			writeRecovery(ctx.db, input.workspaceId, input.terminalId, {
				hasSelection: false,
				accountSelection: null,
			}),
	});
}
