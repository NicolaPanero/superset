import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { z } from "zod";
import { forkToolPath } from "./fork-tool-path";
import type {
	SessionTransferProvider,
	TransferInput,
	TransferResult,
} from "./provider";
import {
	isVerifiedNativeAgent,
	TRANSFER_AGENTS,
	type TransferAgent,
} from "./registry";

const engine = z.object({
	protocolVersion: z.literal(1),
	// Any release of the owner's txcript fork (`<version>-fork.<n>`); the app
	// bundles its pinned and tested version.
	engineVersion: z.string().regex(/^\d+\.\d+\.\d+-fork\.\d+$/),
});
const capabilitiesSchema = engine.extend({
	conversionOnly: z.literal(true),
	verifiedAdapters: z.array(z.string()),
	declaredAdapters: z.array(z.string()),
});
const resultSchema = engine.extend({
	targetAgent: z.string(),
	targetSessionId: z.union([
		z.string().uuid(),
		z.string().regex(/^ses_[a-zA-Z0-9]{10,128}$/),
	]),
	reference: z.string().min(1),
	cwd: z.string().min(1),
	messageCount: z.number().int().positive(),
	warnings: z.array(z.string().max(1000)).max(20),
});

/**
 * The helper shipped in the app bundle (Contents/Resources/resources/bin, next
 * to the bundled CLI) wins, so app and engine versions always match; a
 * development checkout uses the one built into the Superset home.
 */
export function txcriptHelperPath(
	execPath = process.execPath,
	exists: (path: string) => boolean = existsSync,
	platform: NodeJS.Platform = process.platform,
): string {
	return forkToolPath("txcript-transfer", execPath, exists, platform);
}

export function runHelper(
	binary: string,
	args: string[],
	input?: unknown,
	signal?: AbortSignal,
	options?: { cwd: string },
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let outputBytes = 0;
		let forceStop: ReturnType<typeof setTimeout> | undefined;
		const child = spawn(binary, args, {
			cwd: options?.cwd,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const timeout = setTimeout(
			() => stop("conversion_timeout"),
			args[0] === "capabilities" ? 5_000 : 120_000,
		);
		function killTree(force = false) {
			try {
				if (process.platform === "win32")
					child.kill(force ? "SIGKILL" : "SIGTERM");
				else if (child.pid)
					process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
			} catch {}
		}
		function cleanup() {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
		}
		function stop(code: string) {
			if (settled) return;
			settled = true;
			cleanup();
			killTree();
			forceStop = setTimeout(() => killTree(true), 1_000);
			forceStop.unref();
			reject(new Error(code));
		}
		function abort() {
			stop("transfer_cancelled");
		}
		function capture(chunk: Buffer, channel: "stdout" | "stderr") {
			if (settled) return;
			outputBytes += chunk.length;
			if (outputBytes > 1024 * 1024) {
				stop("helper_output_too_large");
				return;
			}
			if (channel === "stdout") stdout.push(chunk);
			else stderr.push(chunk);
		}
		child.stdout.on("data", (chunk) => capture(chunk, "stdout"));
		child.stderr.on("data", (chunk) => capture(chunk, "stderr"));
		child.on("error", () => stop("helper_unavailable"));
		child.on("close", (code) => {
			if (forceStop) clearTimeout(forceStop);
			if (settled) return;
			settled = true;
			cleanup();
			if (code !== 0) {
				let errorCode = "conversion_failed";
				try {
					const parsed = JSON.parse(Buffer.concat(stderr).toString("utf8"));
					if (
						typeof parsed.error === "string" &&
						/^[a-z_]{1,64}$/.test(parsed.error)
					)
						errorCode = parsed.error;
				} catch {}
				reject(new Error(errorCode));
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
			} catch {
				reject(new Error("invalid_helper_response"));
			}
		});
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
		child.stdin.on("error", () => {});
		child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
	});
}

function windowsNativePath(path: string) {
	if (path.startsWith("\\\\?\\UNC\\"))
		return win32.normalize(`\\\\${path.slice(8)}`);
	if (/^\\\\\?\\[a-z]:\\/i.test(path)) return win32.normalize(path.slice(4));
	return win32.normalize(path);
}

export function parseNativeTransferResult(
	raw: unknown,
	input: TransferInput,
	platform: NodeJS.Platform = process.platform,
): TransferResult {
	const result = resultSchema.parse(raw);
	const paths = platform === "win32" ? win32 : posix;
	const normalize =
		platform === "win32" ? windowsNativePath : (path: string) => path;
	const reference = normalize(result.reference);
	const cwd = normalize(result.cwd);
	const targetRoot = normalize(input.targetRoot);
	const path = paths.relative(targetRoot, reference);
	if (
		result.targetAgent !== TRANSFER_AGENTS[input.targetAgent].harness ||
		(input.targetAgent === "opencode"
			? !result.targetSessionId.startsWith("ses_") ||
				paths.relative(targetRoot, reference) !== ""
			: !z.string().uuid().safeParse(result.targetSessionId).success) ||
		result.targetSessionId === input.sourceSessionId ||
		(platform === "win32"
			? paths.relative(normalize(input.cwd), cwd) !== ""
			: cwd !== input.cwd) ||
		!paths.isAbsolute(reference) ||
		path === ".." ||
		path.startsWith(`..${paths.sep}`) ||
		paths.isAbsolute(path)
	) {
		throw new Error("target_validation_failed");
	}
	return {
		mode: "native",
		targetSessionId: result.targetSessionId,
		reference,
		cwd,
		messageCount: result.messageCount,
		warnings: result.warnings,
	};
}

const historyBlockSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), text: z.string() }),
	z.object({ type: z.literal("thinking"), text: z.string() }),
	z.object({
		type: z.literal("tool"),
		id: z.string(),
		name: z.string(),
		input: z.string(),
		output: z.string(),
		isError: z.boolean(),
	}),
]);
const historySchema = engine.extend({
	truncated: z.boolean(),
	messages: z.array(
		z.object({
			role: z.enum(["user", "assistant"]),
			timestampMs: z.number(),
			blocks: z.array(historyBlockSchema),
		}),
	),
});
export type EarlierHistory = z.infer<typeof historySchema>;

export class TxcriptTransferProvider implements SessionTransferProvider {
	readonly id = "native";
	constructor(
		private readonly binary = txcriptHelperPath(),
		private readonly run: typeof runHelper = runHelper,
	) {}
	async capabilities() {
		try {
			return capabilitiesSchema.parse(
				await this.run(this.binary, ["capabilities"]),
			);
		} catch {
			return null;
		}
	}
	async isAvailable() {
		return (await this.capabilities()) !== null;
	}
	async canTransfer(source: TransferAgent, target: TransferAgent) {
		if (
			!isVerifiedNativeAgent(source) ||
			!isVerifiedNativeAgent(target) ||
			source === target
		)
			return false;
		const capabilities = await this.capabilities();
		return Boolean(
			capabilities?.verifiedAdapters.includes(
				TRANSFER_AGENTS[source].harness,
			) &&
				capabilities.verifiedAdapters.includes(TRANSFER_AGENTS[target].harness),
		);
	}
	async history(input: {
		sourceAgent: TransferAgent;
		sourceSessionId: string;
		sourceRoot: string;
		sourceReference: string;
	}): Promise<EarlierHistory> {
		return historySchema.parse(
			await this.run(this.binary, ["history"], {
				...input,
				sourceAgent: TRANSFER_AGENTS[input.sourceAgent].harness,
			}),
		);
	}
	async transfer(input: TransferInput): Promise<TransferResult> {
		if (!(await this.canTransfer(input.sourceAgent, input.targetAgent)))
			throw new Error("native_unavailable");
		return parseNativeTransferResult(
			await this.run(
				this.binary,
				[],
				{
					sourceAgent: TRANSFER_AGENTS[input.sourceAgent].harness,
					sourceSessionId: input.sourceSessionId,
					sourceRoot: input.sourceRoot,
					sourceReference: input.sourceReference,
					targetAgent: TRANSFER_AGENTS[input.targetAgent].harness,
					targetRoot: input.targetRoot,
					cwd: input.cwd,
				},
				input.signal,
				{ cwd: input.cwd },
			),
			input,
		);
	}
}
