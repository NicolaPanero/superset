import { accessSync, constants } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import {
	CodexRpcClient,
	spawnCodexTransport,
} from "@superset/chat-runtime/fork-quota-rpc";
import { z } from "zod";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
import { withProbeSlot } from "./fork-account-probe";
import { forkAccountRegistry } from "./fork-account-registry";
import { independentProfile } from "./fork-profile-directory";
import { invalidateQuota } from "./fork-quota-cache";
import { invalidateQuotaFetch } from "./fork-quota-fetch";
import { resetAttemptLedger } from "./fork-reset-attempts";
import { readAccountIdentity } from "./session-account/session-account";

const creditSchema = z.object({
	id: z.string().min(1).max(512),
	resetType: z.string().max(64),
	status: z.string().max(64),
	expiresAt: z.number().int().nonnegative().nullable().optional(),
});
const limitsSchema = z.object({
	rateLimitResetCredits: z
		.object({
			availableCount: z.number().int().nonnegative(),
			credits: z.array(creditSchema).max(128).nullable().optional(),
		})
		.nullish(),
});
const outcomeSchema = z.object({
	outcome: z.enum(["reset", "alreadyRedeemed", "nothingToReset", "noCredit"]),
});
type Outcome = z.infer<typeof outcomeSchema>["outcome"];
type Identity = { identity: string; email: string };
type Rpc = { request(method: string, params?: unknown): Promise<unknown> };
export type ResetAttempt = { idempotencyKey: string; creditId?: string };
export type ResetStatus = {
	status: "ready" | "unavailable" | "unsupported";
	identity: string;
	email: string;
	availableCount: number | null;
	credits: { id: string; expiresAt: Date | null }[] | null;
	fetchedAt: Date;
	pendingAttempt: ResetAttempt | null;
};

export async function trustedResetIdentity(
	selection: string,
	dependencies = {
		registry: forkAccountRegistry(),
		identity: readAccountIdentity,
		independent: independentProfile,
	},
): Promise<Identity> {
	const saved = dependencies.registry
		.list()
		.find((row) => row.agent === "codex" && row.selection === selection);
	const current =
		saved &&
		saved.credentialKind === "subscription" &&
		(await dependencies.independent("codex", selection))
			? await dependencies.identity("codex", selection)
			: null;
	if (
		!current ||
		current.identity !== saved?.identity ||
		current.email !== saved.email
	)
		throw new Error("reset_account_changed");
	return current;
}

export async function withCodexResetRpc<T>(
	selection: string,
	run: (rpc: Rpc) => Promise<T>,
	timeoutMs = 13_000,
	settings = {
		baseEnv: async () => {
			await waitForTerminalBaseEnv();
			return getTerminalBaseEnv();
		},
		root: () => join(resolveSupersetHomeDir(), "fork", "reset-probes"),
		spawn: spawnCodexTransport,
	},
): Promise<T> {
	const env: Record<string, string> = {
		...(await settings.baseEnv()),
		CODEX_HOME: selection,
	};
	for (const key of [
		"OPENAI_API_KEY",
		"CODEX_API_KEY",
		"ANTHROPIC_API_KEY",
		"ANTHROPIC_AUTH_TOKEN",
		"CLAUDE_CODE_OAUTH_TOKEN",
		"SUPERSET_HOOKS_DIR",
	])
		delete env[key];
	const command = (env.PATH ?? "")
		.split(delimiter)
		.map((dir) =>
			join(dir, process.platform === "win32" ? "codex.exe" : "codex"),
		)
		.find((file) => {
			try {
				accessSync(file, constants.X_OK);
				return true;
			} catch {
				return false;
			}
		});
	if (!command) throw new Error("reset_cli_unavailable");
	const root = settings.root();
	await mkdir(root, { recursive: true, mode: 0o700 });
	const cwd = await mkdtemp(join(root, "probe-"));
	const client = new CodexRpcClient({
		createTransport: (handlers) =>
			settings.spawn(
				{
					command,
					cwd,
					env,
					args: [
						"app-server",
						"--listen",
						"stdio://",
						"-c",
						"mcp_servers={}",
						"-c",
						"notify=[]",
						"-c",
						"features.hooks=false",
					],
				},
				handlers,
			),
		onNotification: () => {},
		onServerRequest: () => {},
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			client.initialize().then(() => run(client)),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("reset_timeout")), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
		try {
			await client.close();
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	}
}

export class AccountResetService {
	private reads = new Map<
		string,
		{ at: number; pending: boolean; promise: Promise<ResetStatus> }
	>();
	private attempts = new Map<
		string,
		ResetAttempt & {
			identity: string;
			at: number;
			outcome?: Outcome;
			submitted?: boolean;
			running?: Promise<{ outcome: Outcome }>;
		}
	>();
	constructor(
		private dependencies = {
			identity: trustedResetIdentity,
			rpc: withCodexResetRpc,
			slot: withProbeSlot,
			invalidate: async (selection: string) => {
				await invalidateQuotaFetch(
					"https://chatgpt.com/backend-api/wham/usage",
					`codex:${selection}`,
				);
				invalidateQuota();
			},
			restore: (selection: string, now: number) =>
				resetAttemptLedger().load(selection, now),
			save: (
				selection: string,
				attempt: Parameters<ReturnType<typeof resetAttemptLedger>["save"]>[1],
				now: number,
			) => resetAttemptLedger().save(selection, attempt, now),
			now: Date.now,
		},
	) {}

	private restore(selection: string) {
		if (!this.attempts.has(selection)) {
			const saved = this.dependencies.restore(
				selection,
				this.dependencies.now(),
			);
			if (saved && this.attempts.size < 128)
				this.attempts.set(selection, saved);
		}
	}
	private sweep() {
		const now = this.dependencies.now();
		for (const [key, read] of this.reads)
			if (!read.pending && now - read.at >= 300_000) this.reads.delete(key);
		for (const [key, attempt] of this.attempts)
			if (!attempt.running && now - attempt.at >= 86_400_000)
				this.attempts.delete(key);
	}
	private async sameAccount(selection: string, identity: Identity, rpc: Rpc) {
		const read = z
			.object({
				account: z.object({ type: z.literal("chatgpt"), email: z.string() }),
			})
			.parse(await rpc.request("account/read", { refreshToken: true }));
		if (
			read.account.email !== identity.email ||
			(await this.dependencies.identity(selection)).identity !==
				identity.identity
		)
			throw new Error("reset_account_changed");
	}
	private status(
		selection: string,
		identity: Identity,
		raw: unknown,
	): ResetStatus {
		const summary = limitsSchema.parse(raw).rateLimitResetCredits;
		const now = this.dependencies.now();
		const attempt = this.attempts.get(selection);
		return {
			status: summary ? "ready" : "unsupported",
			...identity,
			availableCount: summary?.availableCount ?? null,
			credits:
				summary?.credits == null
					? null
					: summary.credits
							.filter(
								(credit) =>
									credit.status === "available" &&
									credit.resetType === "codexRateLimits" &&
									(credit.expiresAt == null || credit.expiresAt * 1000 > now),
							)
							.map((credit) => ({
								id: credit.id,
								expiresAt:
									credit.expiresAt == null
										? null
										: new Date(credit.expiresAt * 1000),
							})),
			fetchedAt: new Date(now),
			pendingAttempt:
				attempt &&
				!attempt.outcome &&
				(attempt.submitted || attempt.running) &&
				attempt.identity === identity.identity
					? {
							idempotencyKey: attempt.idempotencyKey,
							creditId: attempt.creditId,
						}
					: null,
		};
	}
	async read(selection: string): Promise<ResetStatus> {
		const identity = await this.dependencies.identity(selection);
		this.sweep();
		this.restore(selection);
		const key = JSON.stringify([selection, identity.identity]);
		const cached = this.reads.get(key);
		if (cached)
			return cached.promise.then((value) => ({
				...value,
				pendingAttempt: this.status(selection, identity, {}).pendingAttempt,
			}));
		if (this.reads.size >= 128)
			return { ...this.status(selection, identity, {}), status: "unavailable" };
		const entry = {
			at: this.dependencies.now(),
			pending: true,
			promise: Promise.resolve(null as unknown as ResetStatus),
		};
		entry.promise = this.dependencies
			.slot(() =>
				this.dependencies.rpc(selection, async (rpc) => {
					await this.sameAccount(selection, identity, rpc);
					const result = this.status(
						selection,
						identity,
						await rpc.request("account/rateLimits/read"),
					);
					if (
						(await this.dependencies.identity(selection)).identity !==
						identity.identity
					)
						throw new Error("reset_account_changed");
					return result;
				}),
			)
			.catch(() => ({
				...this.status(selection, identity, {}),
				status: "unavailable" as const,
			}))
			.finally(() => {
				entry.pending = false;
			});
		this.reads.set(key, entry);
		return entry.promise;
	}
	async consume(
		input: ResetAttempt & { selection: string; expectedIdentity: string },
	): Promise<{ outcome: Outcome }> {
		const identity = await this.dependencies.identity(input.selection);
		if (identity.identity !== input.expectedIdentity)
			throw new Error("reset_account_changed");
		this.sweep();
		this.restore(input.selection);
		const previous = this.attempts.get(input.selection);
		if (previous?.identity === identity.identity) {
			if (previous.idempotencyKey === input.idempotencyKey) {
				if (previous.creditId !== input.creditId)
					throw new Error("reset_attempt_changed");
				if (previous.running) return previous.running;
				if (previous.outcome) return { outcome: previous.outcome };
			} else if (!previous.outcome && (previous.submitted || previous.running))
				throw new Error("reset_attempt_pending");
		}
		if (!previous && this.attempts.size >= 128) throw new Error("reset_busy");
		const attempt =
			previous?.identity === identity.identity &&
			previous.idempotencyKey === input.idempotencyKey
				? previous
				: {
						...input,
						identity: identity.identity,
						at: this.dependencies.now(),
						outcome: undefined as Outcome | undefined,
						running: undefined as Promise<{ outcome: Outcome }> | undefined,
					};
		const replay = previous === attempt && attempt.submitted === true;
		this.dependencies.save(input.selection, attempt, this.dependencies.now());
		this.attempts.set(input.selection, attempt);
		attempt.running = this.dependencies
			.slot(() =>
				this.dependencies.rpc(input.selection, async (rpc) => {
					await this.sameAccount(input.selection, identity, rpc);
					const status = this.status(
						input.selection,
						identity,
						await rpc.request("account/rateLimits/read"),
					);
					if (!replay) {
						if (status.status !== "ready") throw new Error("reset_unsupported");
						if (status.availableCount === 0)
							return { outcome: "noCredit" as const };
						if (
							input.creditId &&
							!status.credits?.some((credit) => credit.id === input.creditId)
						)
							throw new Error("reset_credit_unavailable");
					}
					if (
						(await this.dependencies.identity(input.selection)).identity !==
						identity.identity
					)
						throw new Error("reset_account_changed");
					attempt.submitted = true;
					this.dependencies.save(
						input.selection,
						attempt,
						this.dependencies.now(),
					);
					return outcomeSchema.parse(
						await rpc.request("account/rateLimitResetCredit/consume", {
							idempotencyKey: input.idempotencyKey,
							...(input.creditId ? { creditId: input.creditId } : {}),
						}),
					);
				}),
			)
			.then((result) => {
				attempt.outcome = result.outcome;
				this.dependencies.save(
					input.selection,
					attempt,
					this.dependencies.now(),
				);
				return result;
			})
			.finally(async () => {
				attempt.running = undefined;
				this.reads.delete(JSON.stringify([input.selection, identity.identity]));
				await this.dependencies.invalidate(input.selection);
			});
		return attempt.running;
	}
}

export const accountResetService = new AccountResetService();
