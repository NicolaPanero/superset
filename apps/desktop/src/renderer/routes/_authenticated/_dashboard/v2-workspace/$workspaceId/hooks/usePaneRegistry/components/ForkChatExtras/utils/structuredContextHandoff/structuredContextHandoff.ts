import type { ChatTransport } from "@superset/chat/client";
import { TRANSCRIPT_TRUNCATION_NOTICE } from "@superset/shared/terminal-session-handoff";
import { contextHandoff } from "../contextHandoff/contextHandoff";

export interface StructuredContext {
	prompt: string;
	included: number;
	omitted: number;
	omittedUnknown: boolean;
}

export type ContextCoverage =
	| { kind: "complete" }
	| { kind: "counted"; included: number; omitted: number; atLeast: boolean }
	| { kind: "uncounted" };

/**
 * The host's whole-message selection from the agent's own session store. The
 * chat journal is the fallback when the host cannot read that store, for
 * example with a txcript engine too old to page the whole session.
 */
export async function structuredContextHandoff(input: {
	transport: Pick<ChatTransport, "getItems">;
	chatSessionId: string;
	agentLabel: string;
	structured?: () => Promise<StructuredContext>;
}): Promise<{ prompt: string; coverage: ContextCoverage }> {
	if (input.structured) {
		try {
			const result = await input.structured();
			return {
				prompt: result.prompt,
				coverage:
					result.omitted > 0 || result.omittedUnknown
						? {
								kind: "counted",
								included: result.included,
								omitted: result.omitted,
								atLeast: result.omittedUnknown,
							}
						: { kind: "complete" },
			};
		} catch (error) {
			console.warn("[acp-chat] structured context unavailable", error);
		}
	}
	const prompt = await contextHandoff(
		input.transport,
		input.chatSessionId,
		input.agentLabel,
	);
	return {
		prompt,
		coverage: prompt.includes(TRANSCRIPT_TRUNCATION_NOTICE)
			? { kind: "uncounted" }
			: { kind: "complete" },
	};
}
