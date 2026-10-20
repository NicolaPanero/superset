import { isAbsolute } from "node:path";

export function forkConfiguredCli(
	config: { presetId: string; command: string; args: string[] } | null,
) {
	if (
		!config ||
		(config.presetId !== "grok" &&
			config.presetId !== "cursor-agent" &&
			config.presetId !== "gemini" &&
			config.presetId !== "agy")
	)
		return {};
	const index = config.args.indexOf("--model");
	const model =
		index >= 0
			? config.args[index + 1]
			: config.args.find((arg) => arg.startsWith("--model="))?.slice(8);
	return {
		command: isAbsolute(config.command) ? config.command : undefined,
		model: config.presetId === "agy" ? undefined : model,
	};
}
