import { expect, test } from "bun:test";
import { addAccountCommand } from "../addAccountCommand";
import { switchSignInCommand } from "../switchSignInCommand";
import { windowsLoginScript } from "./forkWindowsLogin";

function script(command: string) {
	return Buffer.from(command.split(" ").at(-1) || "", "base64").toString(
		"utf16le",
	);
}
test("Windows creates isolated Claude and Codex subscription profiles", () => {
	for (const agent of ["claude", "codex"] as const) {
		const text = script(
			addAccountCommand(
				agent,
				"superset-login-test",
				"subscription",
				true,
				"win32",
			),
		);
		expect(text).toContain(`'.${agent}-superset-login-test'`);
		expect(text).toContain(
			agent === "claude" ? "& claude auth login" : "& codex login",
		);
		expect(text).toContain("$loginStatus -ne 0");
		expect(text.indexOf(".superset-login-complete")).toBeGreaterThan(
			text.indexOf("$loginStatus -ne 0"),
		);
	}
});
test("Windows reconnect quotes Unicode paths as data and restores the previous environment", () => {
	const path = "C:\\Users\\Là ' Test\\.codex-work";
	const text = script(
		switchSignInCommand(
			{ agent: "codex", credentialKind: "subscription", selection: path },
			"win32",
		),
	);
	expect(text).toContain("Là '' Test");
	expect(text).toContain("finally");
	expect(text).toContain("$previous");
	expect(text).toContain('cli_auth_credentials_store="file"');
});
test("Windows API keys are read securely and passed on stdin without appearing in command arguments", () => {
	const text = windowsLoginScript({
		agent: "codex",
		credentialKind: "api_key",
		slug: "api",
	});
	expect(text).toContain("Read-Host 'API key' -AsSecureString");
	expect(text).toContain("$apiKey | & codex login");
	expect(text).toContain("ZeroFreeBSTR");
	expect(text.indexOf(".superset-api-billing")).toBeGreaterThan(
		text.indexOf("$loginStatus -ne 0"),
	);
});
test("Windows rejects profile-name injection before producing a command", () => {
	expect(() =>
		addAccountCommand("claude", "x';exit 0;#", "subscription", true, "win32"),
	).toThrow();
});

test("Windows advanced CLI reconnection keeps the CLI's configured home", () => {
	const text = script(
		switchSignInCommand(
			{ agent: "codex", credentialKind: "api_key", selection: null },
			"win32",
		),
	);
	expect(text).toContain("if ($env:CODEX_HOME)");
});
