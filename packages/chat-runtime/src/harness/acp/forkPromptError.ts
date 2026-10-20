import type { Turn } from "@superset/chat/protocol";
import { AcpRpcError } from "./rpcClient";

export function forkPromptError(error: unknown): NonNullable<Turn["error"]> {
	const message = error instanceof Error ? error.message : String(error);
	if (!(error instanceof AcpRpcError) || error.method !== "session/prompt")
		return { message };
	const data = error.data;
	if (!data || typeof data !== "object" || Array.isArray(data))
		return { message };
	const details = data as { message?: unknown; codexErrorInfo?: unknown };
	return {
		message:
			typeof details.message === "string" && details.message.length <= 4096
				? `${message}: ${details.message}`
				: message,
		...(typeof details.codexErrorInfo === "string"
			? { providerCode: details.codexErrorInfo }
			: {}),
	};
}
