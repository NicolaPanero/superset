import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAccountCommand } from "../../apps/desktop/src/renderer/routes/_authenticated/settings/usage/components/UsageView/utils/addAccountCommand/addAccountCommand";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
async function runFakeLogin(exitCode: number) {
	const root = mkdtempSync(join(tmpdir(), "fork-login-command-"));
	roots.push(root);
	const bin = join(root, "bin");
	mkdirSync(bin);
	writeFileSync(
		join(bin, "claude"),
		`#!/bin/sh\nmkdir -p "$CLAUDE_CONFIG_DIR"\nexit ${exitCode}\n`,
		{ mode: 0o700 },
	);
	const slug = "superset-login-34c89ba6-f34e-41d4-b351-76f90b58a0d4";
	const command = addAccountCommand(
		"claude",
		slug,
		"subscription",
		true,
	).replaceAll("$HOME", root);
	const proc = Bun.spawn(["/bin/sh", "-c", command], {
		env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		root,
		selection: join(root, `.claude-${slug}`),
		code: await proc.exited,
	};
}

test("automatic naming is finalized only after the provider login exits successfully", async () => {
	const f = await runFakeLogin(0);
	expect(f.code).toBe(0);
	expect(
		readFileSync(join(f.selection, ".superset-login-complete"), "utf8"),
	).toBe("claude:superset-login-34c89ba6-f34e-41d4-b351-76f90b58a0d4");
});
test("a failed sign-in cannot trigger a profile rename", async () => {
	const f = await runFakeLogin(7);
	expect(f.code).toBe(7);
	expect(existsSync(join(f.selection, ".superset-login-complete"))).toBe(false);
});
test("explicit profile names keep the original login command and never request auto naming", () => {
	expect(addAccountCommand("claude", "personal", "subscription")).toBe(
		'CLAUDE_CONFIG_DIR="$HOME/.claude-personal" claude auth login',
	);
});
test("automatic API and Codex sign-ins also mark completion after success", () => {
	for (const agent of ["claude", "codex"] as const)
		for (const kind of ["subscription", "api_key"] as const) {
			const command = addAccountCommand(
				agent,
				"superset-login-fixture",
				kind,
				true,
			);
			expect(
				command.endsWith(
					` && printf ${agent}:superset-login-fixture > "$HOME/.${agent}-superset-login-fixture"/.superset-login-complete`,
				),
			).toBe(true);
		}
});
test("unsafe profile names cannot become shell commands", () => {
	for (const slug of [
		"",
		"../../",
		"$(echo unsafe)",
		"x;echo unsafe",
		"x\nunsafe",
	])
		expect(() => addAccountCommand("claude", slug, "subscription")).toThrow(
			"account_profile_name_invalid",
		);
});
