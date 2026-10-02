import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { HarnessFactory } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";
import catalogue from "./acp-harnesses.json" with { type: "json" };
import { resolveAgentCli } from "./agentCli";

type AcpHarness = {
	/** The agent's id in the ACP registry, for tracing an entry back to it. */
	registryId: string;
	/** Executable name, and the `~/.superset/bin` wrapper name. */
	binary: string;
	args?: string[];
	minVersion: string;
	upgrade?: string;
	/** Absent when the CLI speaks ACP itself and needs no translator. */
	adapter?: string;
	executableEnv?: string;
};

const ACP_HARNESSES: Record<string, AcpHarness> = Object.fromEntries(
	Object.entries(catalogue as Record<string, unknown>).filter(
		([key]) => !key.startsWith("$"),
	),
) as Record<string, AcpHarness>;

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

/**
 * Ambient keys must never override the user's own agent login — the whole
 * point is to reuse the CLI's stored credentials, not bill an API key.
 */
function withoutAmbientKeys(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
	return rest;
}

/**
 * A HarnessFactory that bridges an ACP agent into the chat runtime. The agent
 * is whichever CLI the user has installed; nothing here ships one. Returns null
 * only when a translator this harness needs is not in the bundle — a missing or
 * outdated CLI is the reader's to fix, so it is reported when they open the
 * chat rather than hidden by dropping the harness.
 */
export function acpHarnessFactory(harness: string): HarnessFactory | null {
	const entry = ACP_HARNESSES[harness];
	if (!entry) return null;

	let adapterEntry: string | undefined;
	if (entry.adapter) {
		try {
			adapterEntry = resolveAdapterEntry(entry.adapter);
		} catch {
			return null;
		}
	}

	return (options) =>
		createAcpAdapter({
			command: entry.binary,
			cwd: options.cwd,
			launch: async () => {
				const cli = await resolveAgentCli({
					binary: entry.binary,
					minVersion: entry.minVersion,
					upgrade: entry.upgrade,
				});
				const env = withoutAmbientKeys(cli.env);
				if (!adapterEntry) {
					return { command: cli.command, args: entry.args, env };
				}
				return {
					command: process.execPath,
					args: [adapterEntry, ...(entry.args ?? [])],
					env: {
						...env,
						// Packaged builds ship no `node` on PATH; Electron runs the
						// script when this is set, and plain-node hosts ignore it.
						ELECTRON_RUN_AS_NODE: "1",
						...(entry.executableEnv
							? { [entry.executableEnv]: cli.command }
							: {}),
					},
				};
			},
		});
}

export function acpHarnessEntries(): [string, HarnessFactory][] {
	const entries: [string, HarnessFactory][] = [];
	for (const harness of Object.keys(ACP_HARNESSES)) {
		const factory = acpHarnessFactory(harness);
		if (factory) entries.push([harness, factory]);
	}
	return entries;
}
