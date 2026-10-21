import type { Decision, Turn, UserContent } from "@superset/chat/protocol";
import {
	type AdapterEvent,
	EventQueue,
	type HarnessAdapter,
	type HarnessStartOptions,
} from "@superset/chat-runtime";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";
import type { UsageAccount } from "../trpc/router/usage/types";
import {
	isAccountQuotaFailure,
	isClaudeQuotaMessage,
	recoveryResetAt,
	suggestedRecoveryAccount,
} from "./forkQuotaRecoveryPolicy";
import type {
	RecoverySettings,
	RecoveryStatus,
} from "./forkQuotaRecoveryStore";

export type RecoveryDependencies = {
	agent?: "claude" | "codex";
	create(selection: string | null | undefined): HarnessAdapter;
	settings(): RecoverySettings;
	account(): SessionAccount | undefined;
	quota(): Promise<UsageAccount[]>;
	move(sessionId: string, selection: string | null): Promise<void>;
	selected(selection: string | null, nativeId: string): void;
	status(status: RecoveryStatus): void;
	onDispose?(): void;
	validate?(): Promise<boolean>;
	now?: () => number;
	wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};
const CONTINUE: UserContent[] = [
	{
		type: "text",
		text: "Continue the interrupted task from where it stopped. Check the work already completed before taking further actions; do not repeat completed steps.",
	},
];
const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		timer.unref?.();
		if (signal.aborted) finish();
		else signal.addEventListener("abort", finish, { once: true });
	});

/** Runs on the host, including while the pane is closed. The public runtime
 * session and its journal stay put; only the proprietary ACP worker changes. */
export class ForkQuotaRecoveryAdapter implements HarnessAdapter {
	private queue = new EventQueue();
	private child: HarnessAdapter;
	private startOptions!: HarnessStartOptions;
	private nativeId?: string;
	private model?: string;
	private mode?: string;
	private selection: string | null | undefined;
	private heldTurn?: Turn;
	private attempts = 0;
	private blocked = new Map<string, number>();
	private abort?: AbortController;
	private disposed = false;
	private restarting = false;
	private ready = false;
	private pendingContinue = false;
	private cancelled = false;
	private failureAt = 0;
	private activeBackground = false;
	private workerStopped = false;
	private targetEmail?: string | null;
	private unavailable = false;
	private recoveryOption: keyof RecoverySettings = "switchAccounts";
	// One failed turn, scoped to this live worker and its captured login. Never
	// resurrect an old task after a new prompt, Stop, or a session/account change.
	private quotaFailure?: {
		turn: Turn;
		at: number;
		nativeId: string;
		identity: string;
		selection: string | null;
	};
	private recoveringQuota = false;
	private lastAgentText = "";
	private waitingForQuota = false;
	constructor(
		private deps: RecoveryDependencies,
		selection?: string | null,
	) {
		this.selection = selection;
		this.child = deps.create(selection);
	}
	start(options: HarnessStartOptions) {
		this.startOptions = options;
		this.nativeId = options.resume?.harnessSessionId;
		this.model = options.modelId;
		this.mode = options.modeId;
		void this.consume(this.child, options);
		return this.queue.iterable();
	}
	private now() {
		return this.deps.now?.() ?? Date.now();
	}
	changed() {
		const failure = this.quotaFailure,
			account = this.deps.account(),
			settings = this.deps.settings();
		if (this.waitingForQuota || !settings[this.recoveryOption])
			this.abort?.abort();
		if (
			!failure ||
			this.recoveringQuota ||
			this.restarting ||
			this.disposed ||
			this.cancelled ||
			(!settings.switchAccounts && !settings.resumeAtReset) ||
			failure.nativeId !== this.nativeId ||
			account?.identity !== failure.identity ||
			account?.selection !== failure.selection ||
			this.now() - failure.at >= 24 * 60 * 60_000
		)
			return;
		this.quotaFailure = undefined;
		void this.recover(failure.turn, failure.at, true).then((recovered) => {
			if (recovered || this.disposed) return;
			this.emit({ kind: "turn", turn: failure.turn });
			this.queue.push({ kind: "session", session: { status: "idle" } });
		});
	}
	private emit(event: AdapterEvent) {
		if (this.heldTurn && event.kind === "turn")
			event = {
				...event,
				turn: {
					...event.turn,
					id: this.heldTurn.id,
					startedAtMs: this.heldTurn.startedAtMs,
				},
			};
		if (this.heldTurn && event.kind === "item")
			event = { ...event, turnId: this.heldTurn.id };
		this.queue.push(event);
	}
	private async consume(child: HarnessAdapter, options: HarnessStartOptions) {
		try {
			for await (const event of child.start(options)) {
				if (this.disposed || child !== this.child) break;
				if (event.kind === "session") {
					if (event.session.status === "dead") this.quotaFailure = undefined;
					this.nativeId = event.session.harnessSessionId ?? this.nativeId;
					this.model = event.session.modelId ?? this.model;
					this.mode = event.session.modeId ?? this.mode;
					if (event.session.backgroundTasks)
						this.activeBackground = event.session.backgroundTasks.length > 0;
					if (this.restarting && !this.ready) {
						if (event.session.status === "dead") {
							this.failRecovery();
							this.queue.push(event);
							continue;
						}
						if (event.session.status !== "idle") continue;
						if (
							this.pendingContinue &&
							(this.cancelled || !this.deps.settings()[this.recoveryOption])
						) {
							this.pendingContinue = false;
							if (this.heldTurn)
								this.queue.push({
									kind: "turn",
									turn: {
										...this.heldTurn,
										status: "interrupted",
										completedAtMs: this.now(),
									},
								});
							this.heldTurn = undefined;
							this.deps.status({ phase: "idle" });
						}
						if (this.pendingContinue) {
							const account = this.deps.account();
							if (
								!account ||
								account.credentialKind !== "subscription" ||
								account.agent !== (this.deps.agent ?? "claude") ||
								(this.targetEmail && account.email !== this.targetEmail)
							) {
								this.unavailable = true;
								this.failRecovery();
								this.queue.push({
									kind: "session",
									session: { status: "dead" },
								});
								await child.dispose();
								break;
							}
							this.deps.selected(account.selection, this.nativeId ?? "");
						}
						this.ready = true;
						this.restarting = false;
						this.emit({
							...event,
							session: {
								...event.session,
								status: this.pendingContinue ? "running" : "idle",
							},
						});
						// Bootstrap applies the saved model/mode after its idle notification.
						// prompt() waits for those selection round trips in the official adapter.
						if (this.pendingContinue) {
							this.pendingContinue = false;
							child.prompt(CONTINUE);
						}
						continue;
					}
				}
				if (this.restarting && !this.ready) {
					if (
						event.kind === "item" &&
						event.item.kind === "notice" &&
						event.item.noticeKind === "error"
					)
						this.emit(event);
					continue;
				}
				if (event.kind === "item" && event.item.kind === "agent_message")
					this.lastAgentText = String(event.item.text ?? "");
				const quotaTurn =
					event.kind === "turn" ? this.quotaFailedTurn(event.turn) : undefined;
				if (event.kind === "turn" && event.turn.status !== "running")
					this.lastAgentText = "";
				if (quotaTurn) {
					const account = this.deps.account();
					this.quotaFailure =
						this.nativeId && account?.credentialKind === "subscription"
							? {
									turn: quotaTurn,
									at: this.now(),
									nativeId: this.nativeId,
									identity: account.identity,
									selection: account.selection,
								}
							: undefined;
					if (await this.recover(quotaTurn)) {
						this.quotaFailure = undefined;
						break;
					}
				} else if (event.kind === "turn") {
					this.quotaFailure = undefined;
				}
				this.emit(event);
				if (event.kind === "turn" && event.turn.status !== "running") {
					this.heldTurn = undefined;
					this.attempts = 0;
					this.blocked.clear();
					this.deps.status({ phase: "idle" });
				}
			}
		} catch {
			this.failRecovery();
			this.queue.push({ kind: "session", session: { status: "dead" } });
		}
	}
	private quotaFailedTurn(turn: Turn): Turn | undefined {
		const agent = this.deps.agent ?? "claude";
		if (turn.status === "failed" && isAccountQuotaFailure(agent, turn.error))
			return turn;
		if (
			turn.status === "completed" &&
			agent === "claude" &&
			isClaudeQuotaMessage(this.lastAgentText)
		)
			return {
				...turn,
				status: "failed",
				error: { message: this.lastAgentText.trim() },
			};
		return undefined;
	}
	private failRecovery() {
		if (this.heldTurn)
			this.queue.push({
				kind: "turn",
				turn: { ...this.heldTurn, status: "failed", completedAtMs: this.now() },
			});
		this.heldTurn = undefined;
		this.pendingContinue = false;
		this.restarting = false;
		this.deps.status({ phase: "stopped" });
	}
	private async recover(
		turn: Turn,
		failureAt = this.now(),
		alreadyFailed = false,
	): Promise<boolean> {
		if (this.recoveringQuota) return false;
		this.recoveringQuota = true;
		try {
			return await this.recoverQuota(turn, failureAt, alreadyFailed);
		} catch {
			return false;
		} finally {
			this.recoveringQuota = false;
		}
	}
	private async recoverQuota(
		turn: Turn,
		failureAt: number,
		alreadyFailed: boolean,
	): Promise<boolean> {
		const settings = this.deps.settings(),
			account = this.deps.account();
		if (
			(!settings.switchAccounts && !settings.resumeAtReset) ||
			!this.nativeId ||
			!account ||
			account.credentialKind !== "subscription" ||
			account.agent !== (this.deps.agent ?? "claude") ||
			this.activeBackground ||
			this.attempts >= 4 ||
			this.disposed
		)
			return false;
		this.cancelled = false;
		this.recoveryOption = settings.switchAccounts
			? "switchAccounts"
			: "resumeAtReset";
		this.workerStopped = false;
		this.failureAt = failureAt;
		this.heldTurn ??= {
			...turn,
			status: "running",
			completedAtMs: undefined,
			error: undefined,
		};
		if (alreadyFailed) {
			this.queue.push({ kind: "turn", turn: this.heldTurn });
			this.queue.push({ kind: "session", session: { status: "running" } });
		}
		this.selection = account.selection;
		const identity = account.identity;
		const expires = failureAt + 24 * 60 * 60_000;
		this.abort = new AbortController();
		try {
			this.deps.status({ phase: "waiting" });
			let rows = await this.deps.quota();
			const failed = rows.find(
				(a) =>
					a.agent === (this.deps.agent ?? "claude") &&
					a.selection === this.selection &&
					a.credentialKind === "subscription",
			);
			if (failed)
				this.blocked.set(
					failed.accountKey,
					recoveryResetAt(failed, failureAt, this.model),
				);
			while (!this.disposed && !this.cancelled && this.now() < expires) {
				const prefs = this.deps.settings(),
					live = this.deps.account();
				if (
					!live ||
					live.identity !== identity ||
					live.selection !== account.selection ||
					live.credentialKind !== "subscription" ||
					(!prefs.switchAccounts && !prefs.resumeAtReset)
				)
					break;
				const now = this.now();
				const other = prefs.switchAccounts
					? suggestedRecoveryAccount(
							rows.filter(
								(a) =>
									!this.blocked.has(a.accountKey) ||
									a.fetchedAt.getTime() > this.failureAt,
							),
							this.selection ?? null,
							this.model,
							this.blocked,
							now,
							this.deps.agent ?? "claude",
						)
					: undefined;
				const own = rows.find(
					(a) =>
						a.agent === (this.deps.agent ?? "claude") &&
						a.selection === this.selection &&
						a.credentialKind === "subscription",
				);
				const readyOwn =
					prefs.resumeAtReset &&
					own &&
					own.fetchedAt.getTime() > this.failureAt &&
					(this.blocked.get(own.accountKey) ?? Infinity) <= now &&
					accountQuotaState(own, this.model, now).reason === "ready";
				const target = other ?? (readyOwn ? own : undefined);
				if (target) {
					if (this.deps.validate && !(await this.deps.validate())) break;
					if (this.abort.signal.aborted) this.abort = new AbortController();
					this.deps.status({
						phase: "switching",
						accountLabel: target.email ?? target.sourceLabel,
					});
					const old = this.child;
					this.workerStopped = true;
					await old.dispose();
					if (
						this.disposed ||
						this.cancelled ||
						this.abort.signal.aborted ||
						!this.deps.settings()[other ? "switchAccounts" : "resumeAtReset"]
					) {
						return this.restoreAfterFailedSwitch(turn);
					}
					if (other) await this.deps.move(this.nativeId, target.selection);
					if (this.disposed || this.cancelled || this.abort.signal.aborted) {
						return this.restoreAfterFailedSwitch(turn);
					}
					this.targetEmail = target.email;
					this.selection = target.selection;
					this.attempts++;
					this.restarting = true;
					this.ready = false;
					this.pendingContinue = true;
					this.recoveryOption = other ? "switchAccounts" : "resumeAtReset";
					this.child = this.deps.create(target.selection);
					this.deps.status({
						phase: "idle",
						accountLabel: target.email ?? target.sourceLabel,
					});
					void this.consume(this.child, {
						...this.startOptions,
						modeId: this.mode,
						modelId: this.model,
						resume: { harnessSessionId: this.nativeId },
						strictResume: true,
					});
					return true;
				}
				if (!prefs.resumeAtReset) break;
				const retryAt = Math.max(
					...rows
						.filter(
							(a) =>
								a.agent === (this.deps.agent ?? "claude") &&
								a.credentialKind === "subscription" &&
								(prefs.switchAccounts || a.selection === this.selection),
						)
						.map((a) => a.retryAt?.getTime() ?? 0),
					0,
				);
				const earliest = Math.min(
					...rows
						.filter(
							(a) =>
								a.agent === (this.deps.agent ?? "claude") &&
								a.credentialKind === "subscription" &&
								(prefs.switchAccounts || a.selection === this.selection),
						)
						.map(
							(a) =>
								this.blocked.get(a.accountKey) ??
								recoveryResetAt(a, now, this.model),
						),
					expires,
				);
				const nextCheckAt = Math.max(
					now + 5 * 60_000,
					Math.min(earliest, expires),
					retryAt,
				);
				if (nextCheckAt > expires) break;
				this.deps.status({ phase: "waiting", nextCheckAt });
				this.waitingForQuota = true;
				try {
					await (this.deps.wait ?? wait)(nextCheckAt - now, this.abort.signal);
				} finally {
					this.waitingForQuota = false;
				}
				if (this.disposed) return true;
				if (this.cancelled) break;
				if (this.abort.signal.aborted) this.abort = new AbortController();
				rows = await this.deps.quota();
			}
		} catch {
			/* Preserve the failed turn; never fall back to another credential. */
		}
		if (this.disposed) return true;
		if (this.workerStopped) return this.restoreAfterFailedSwitch(turn);
		this.heldTurn = undefined;
		this.deps.status({ phase: "stopped" });
		return false;
	}
	private restoreAfterFailedSwitch(turn: Turn) {
		this.child = this.deps.create(this.selection);
		this.restarting = true;
		this.ready = false;
		this.pendingContinue = false;
		// Put the failed turn back before accepting queued, already-authorized prompts.
		// The replacement worker queues them until the original login has loaded.
		this.emit({ kind: "turn", turn });
		this.heldTurn = undefined;
		this.deps.status({ phase: "stopped" });
		void this.consume(this.child, {
			...this.startOptions,
			modeId: this.mode,
			modelId: this.model,
			resume: { harnessSessionId: this.nativeId ?? "" },
			strictResume: true,
		});
		return true;
	}
	prompt(content: UserContent[]) {
		this.quotaFailure = undefined;
		this.cancelled = false;
		if (this.unavailable) throw new Error("source_account_unverified");
		this.attempts = 0;
		this.blocked.clear();
		this.child.prompt(content);
	}
	cancelTurn() {
		this.quotaFailure = undefined;
		this.cancelled = true;
		this.abort?.abort();
		this.child.cancelTurn();
	}
	respondToApproval(id: string, decision: Decision) {
		this.child.respondToApproval(id, decision);
	}
	setMode(mode: string) {
		this.quotaFailure = undefined;
		this.cancelled = true;
		this.mode = mode;
		this.changed();
		this.child.setMode(mode);
	}
	setConfigOption(id: string, value: string) {
		this.quotaFailure = undefined;
		this.cancelled = true;
		this.changed();
		this.child.setConfigOption?.(id, value);
	}
	canSteer() {
		return !this.heldTurn && (this.child.canSteer?.() ?? false);
	}
	steer(content: UserContent[]) {
		return this.child.steer?.(content) ?? Promise.resolve(false);
	}
	forkOptions() {
		return { accountSelection: this.selection };
	}
	fork(point?: { messageId: string }) {
		return this.child.fork?.(point) ?? Promise.resolve(null);
	}
	contextBreakdown() {
		return this.child.contextBreakdown?.() ?? Promise.resolve(null);
	}
	stopBackgroundTask(id: string) {
		return this.child.stopBackgroundTask?.(id) ?? Promise.resolve(false);
	}
	async dispose() {
		this.quotaFailure = undefined;
		this.disposed = true;
		this.abort?.abort();
		await this.child.dispose();
		this.queue.close();
		this.deps.onDispose?.();
	}
}
