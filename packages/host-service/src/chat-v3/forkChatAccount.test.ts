import { expect, test } from "bun:test";
import {
	chatAccountUsesApiCredentials,
	chatSessionAccount,
} from "./forkChatAccount";

test("Codex API credential overrides cannot be mistaken for renewable subscription accounts", async () => {
	for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY"]) {
		const env = { [key]: "fixture-key" };
		expect(chatAccountUsesApiCredentials("codex", env)).toBe(true);
		expect(await chatSessionAccount("codex", env)).toMatchObject({
			agent: "codex",
			credentialKind: "api_key",
		});
	}
});
test("an unrelated provider token cannot disable account continuation for another agent", () => {
	expect(
		chatAccountUsesApiCredentials("codex", {
			ANTHROPIC_AUTH_TOKEN: "fixture-token",
		}),
	).toBe(false);
	expect(
		chatAccountUsesApiCredentials("claude", { OPENAI_API_KEY: "fixture-key" }),
	).toBe(false);
	for (const key of [
		"ANTHROPIC_API_KEY",
		"ANTHROPIC_AUTH_TOKEN",
		"CLAUDE_CODE_OAUTH_TOKEN",
	])
		expect(
			chatAccountUsesApiCredentials("claude", { [key]: "fixture-token" }),
		).toBe(true);
});
