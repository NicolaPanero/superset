import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { HarnessFactory } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";
import catalogue from "./acp-harnesses.json" with { type: "json" };
import { resolveAgentCli } from "./agentCli";

type AcpHarness = {
	registryId: string;
	binary: string;
	args?: string[];
	minVersion: string;
	upgrade?: string;
	adapter?: string;
	executableEnv?: string;
};

const ACP_HARNESSES = Object.fromEntries(
	Object.entries(catalogue as unknown as Record<string, AcpHarness>).filter(
		([key]) => !key.startsWith("$"),
	),
);

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

function withoutAmbientKeys(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
	return rest;
}

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
				if (!entry.executableEnv) {
					throw new Error(
						`${harness} bundles a translator with no way to point it at ${entry.binary}`,
					);
				}
				return {
					command: process.execPath,
					args: [adapterEntry, ...(entry.args ?? [])],
					env: {
						...env,
						ELECTRON_RUN_AS_NODE: "1",
						[entry.executableEnv]: cli.command,
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
