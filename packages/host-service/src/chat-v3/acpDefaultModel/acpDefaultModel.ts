import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function grokDefaultModel(config: string): string | null {
	let inModels = false;
	for (const raw of config.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("[")) {
			inModels = line === "[models]";
			continue;
		}
		const match = inModels && /^default\s*=\s*"([^"]+)"/.exec(line);
		if (match) return match[1] ?? null;
	}
	return null;
}

export function opencodeRecentModel(state: string): string | null {
	const recent = (JSON.parse(state) as { recent?: unknown }).recent;
	const latest = Array.isArray(recent) ? recent[0] : undefined;
	if (
		typeof latest?.providerID !== "string" ||
		typeof latest?.modelID !== "string"
	)
		return null;
	return `${latest.providerID}/${latest.modelID}`;
}

/**
 * The model the agent's own CLI starts on. Over ACP, Grok and OpenCode fall
 * back to another model, which the configured login may not cover.
 */
export async function acpDefaultModel(
	presetId: string,
	home = homedir(),
): Promise<string | null> {
	try {
		if (presetId === "grok")
			return grokDefaultModel(
				await readFile(join(home, ".grok", "config.toml"), "utf8"),
			);
		if (presetId === "opencode")
			return opencodeRecentModel(
				await readFile(
					join(home, ".local", "state", "opencode", "model.json"),
					"utf8",
				),
			);
	} catch {}
	return null;
}
