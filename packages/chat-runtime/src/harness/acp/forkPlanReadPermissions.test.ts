import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForkPlanReadPermissions } from "./forkPlanReadPermissions";
import type { AcpRequestPermissionParams } from "./wire";

const fixture = mkdtempSync(join(tmpdir(), "plan-read-"));
const root = join(fixture, "project");
const source = join(root, "$workspaceId", "page.tsx");
mkdirSync(join(root, "$workspaceId"), { recursive: true });
writeFileSync(source, "branch\n");
writeFileSync(join(fixture, "outside.txt"), "outside\n");
symlinkSync(join(fixture, "outside.txt"), join(root, "outside-link"));
mkdirSync(join(fixture, "other", "child"), { recursive: true });
writeFileSync(join(fixture, "other", "secret"), "outside\n");
writeFileSync(join(root, "secret"), "inside\n");
writeFileSync(join(root, "--stat"), "inside\n");
symlinkSync(join(fixture, "other", "child"), join(root, "outside-dir"));
const policy = new ForkPlanReadPermissions(root);
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function request(input: Record<string, unknown>): AcpRequestPermissionParams {
	return {
		sessionId: "session",
		toolCall: { rawInput: input },
		options: [
			{ optionId: "always", name: "Always", kind: "allow_always" },
			{ optionId: "once", name: "Yes", kind: "allow_once" },
		],
	};
}

function shell(command: string) {
	return policy.allowOption(request({ command }), "Bash");
}

describe("Plan read permissions", () => {
	test("allows native reads and searches inside the workspace for this call only", () => {
		expect(policy.allowOption(request({ file_path: source }), "Read")).toBe(
			"once",
		);
		expect(
			policy.allowOption(request({ path: root, pattern: "branch" }), "Grep"),
		).toBe("once");
		expect(policy.allowOption(request({ pattern: "**/*.tsx" }), "Glob")).toBe(
			"once",
		);
		const onlyDurable = request({ file_path: source });
		onlyDurable.options = onlyDurable.options.slice(0, 1);
		expect(policy.allowOption(onlyDurable, "Read")).toBeUndefined();
	});

	test("keeps traversal, external directories and symlink targets outside the policy", () => {
		for (const file_path of [
			join(fixture, "outside.txt"),
			join(root, "outside-link"),
			"../outside.txt",
			`${root}/outside-dir/../secret`,
		])
			expect(
				policy.allowOption(request({ file_path }), "Read"),
			).toBeUndefined();
		expect(
			policy.allowOption(request({ path: fixture, pattern: "branch" }), "Grep"),
		).toBeUndefined();
		expect(
			policy.allowOption(request({ pattern: "../**" }), "Glob"),
		).toBeUndefined();
		expect(
			policy.allowOption(request({ pattern: "{/etc,src}/*" }), "Glob"),
		).toBeUndefined();
		expect(shell(`cd '${root}' && cat outside-link`)).toBeUndefined();
		expect(shell(`cd '${root}' && cat outside-dir/../secret`)).toBeUndefined();
	});

	test("accepts the screenshot's searches, quoted dollar paths, pipes and command lists", () => {
		const escapedRoot = root.replaceAll("$", "\\$");
		expect(
			shell(
				`cd "${escapedRoot}" && grep -rn "branch" "\\$workspaceId/page.tsx" | head -10; grep -rln "\\.branch\\b" "\\$workspaceId" | head -8`,
			),
		).toBe("once");
		expect(shell(`cat '${source}' | head -n 10`)).toBe("once");
		expect(
			shell(
				`cd '${root}' && rg --files --glob '*.tsx' && sed -n '1,20p' '$workspaceId/page.tsx'`,
			),
		).toBe("once");
		expect(
			shell(`cd '${root}' && grep -e '$(literal)' '$workspaceId/page.tsx'`),
		).toBe("once");
	});

	test("allows Git inspection and rejects commands and options that write or execute helpers", () => {
		for (const command of [
			"git status --short --branch",
			"git log --oneline -5",
			"git diff --no-ext-diff --no-textconv",
			"git diff --stat",
		])
			expect(shell(`cd '${root}' && ${command}`)).toBe("once");
		for (const command of [
			"git reset --hard",
			"git diff --output=patch",
			"git diff --ext-diff",
			"git diff --stat -U5",
			"git diff -- --stat",
			"git diff --quiet",
			"git log --output=log",
			"git -c alias.inspect=bad inspect",
			"rg --pre sh branch .",
		])
			expect(shell(`cd '${root}' && ${command}`)).toBeUndefined();
	});

	test("checks every command and rejects redirections, expansions and unsupported shell syntax", () => {
		for (const command of [
			"grep branch .; touch changed",
			"cat '$workspaceId/page.tsx' > changed",
			"grep branch . | sh",
			'cat "$(touch changed)"',
			"cat `touch changed`",
			"cat <(touch changed)",
			"cat *.tsx",
			"cat $HOME/file",
			"sed -n '1w changed' '$workspaceId/page.tsx'",
			"sed -n '1p' -e 'w changed'",
			"rg -L branch .",
			"ls || touch changed",
			"ls & touch changed",
			"ls\ntouch changed",
			"cat 'unfinished",
		])
			expect(shell(`cd '${root}' && ${command}`)).toBeUndefined();
	});

	test("requires an absolute working directory for relative shell reads", () => {
		expect(shell("cat page.tsx")).toBeUndefined();
		expect(shell("rg --files")).toBeUndefined();
		expect(shell(`cd '${fixture}' && cat outside.txt`)).toBeUndefined();
		expect(shell(`cd '${root}' | cat '${source}'`)).toBeUndefined();
		expect(
			shell(`cd '${root}' && cd '$workspaceId' && cat page.tsx`),
		).toBeUndefined();
	});

	test("never approves edits, mode switches, MCP tools or background and unsandboxed commands", () => {
		for (const name of [
			"Write",
			"Edit",
			"ExitPlanMode",
			"EnterPlanMode",
			"AskUserQuestion",
			"mcp__service__read",
		])
			expect(
				policy.allowOption(
					request({ file_path: source, command: `cat '${source}'` }),
					name,
				),
			).toBeUndefined();
		for (const extra of [
			{ run_in_background: true },
			{ dangerouslyDisableSandbox: true },
		])
			expect(
				policy.allowOption(
					request({ command: `cat '${source}'`, ...extra }),
					"Bash",
				),
			).toBeUndefined();
		expect(policy.allowOption(request({}), "Bash")).toBeUndefined();
	});
});
