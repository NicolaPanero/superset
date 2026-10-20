import { expect, test } from "bun:test";
import { forkPromptError } from "./forkPromptError";
import { AcpRpcError } from "./rpcClient";

test("prompt errors preserve the provider quota code and readable detail without exposing other data", () => {
	const result = forkPromptError(
		new AcpRpcError("session/prompt", -32603, "Internal error", {
			message: "Usage exhausted",
			codexErrorInfo: "usageLimitExceeded",
			token: "secret",
		}),
	);
	expect(result).toEqual({
		message: "session/prompt: Internal error: Usage exhausted",
		providerCode: "usageLimitExceeded",
	});
});
test("unstructured errors and other RPC methods cannot become typed quota failures", () => {
	for (const error of [
		new Error("connection lost"),
		new AcpRpcError("session/load", -32603, "Internal error", {
			codexErrorInfo: "usageLimitExceeded",
		}),
		new AcpRpcError(
			"session/prompt",
			-32603,
			"Internal error",
			"usageLimitExceeded",
		),
	])
		expect(forkPromptError(error).providerCode).toBeUndefined();
	expect(
		forkPromptError(
			new AcpRpcError("session/prompt", -32603, "Internal error", {
				message: "x".repeat(4097),
				codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 429 } },
			}),
		),
	).toEqual({ message: "session/prompt: Internal error" });
});
