import { describe, expect, it } from "bun:test";
import { generateBashCompletion, generateZshCompletion } from "./completion";
import type { CommandNode } from "./help";
import type { ProcessedBuilderConfig } from "./option";

function option(
	partial: Partial<ProcessedBuilderConfig> & { name: string },
): ProcessedBuilderConfig {
	return { type: "string", aliases: [], ...partial };
}

function node(
	name: string,
	partial: Partial<CommandNode> = {},
	children: CommandNode[] = [],
): CommandNode {
	return {
		name,
		children: new Map(children.map((child) => [child.name, child])),
		hasCommand: children.length === 0,
		...partial,
	};
}

function fixture(): CommandNode {
	return node(
		"",
		{
			hasCommand: false,
			options: {
				json: option({ name: "json", type: "boolean", description: "As JSON" }),
				apiKey: option({ name: "api-key", description: "API key" }),
			},
		},
		[
			node(
				"terminals",
				{ description: "Manage terminals", aliases: ["term"] },
				[
					node("read", {
						description: "Read a terminal's output",
						options: {
							workspace: option({
								name: "workspace",
								aliases: ["w"],
								description: "Workspace: id or name",
							}),
							terminal: option({ name: "terminal" }),
							secret: option({ name: "secret", isHidden: true }),
						},
					}),
					node("list", { description: "List terminals" }),
				],
			),
			node("tasks", { description: "Manage tasks" }, [
				node("create", {
					options: {
						priority: option({
							name: "priority",
							enumVals: ["urgent", "high", "low"],
						}),
					},
				}),
			]),
			node("completion", {
				args: [option({ name: "shell", enumVals: ["bash", "zsh"] })],
			}),
			node("status", { description: "Check host service status" }),
			node("orphan", { hasCommand: false }),
		],
	);
}

const cli = { name: "superset", version: "1.0.0", root: fixture() };

const generators = [
	["bash", generateBashCompletion, "complete -F _superset superset"],
	["zsh", generateZshCompletion, "#compdef superset"],
] as const;

describe.each(
	generators,
)("%s completion script", (_shell, generate, marker) => {
	const script = generate(cli);

	it("carries the shell's registration boilerplate", () => {
		expect(script).toContain(marker);
	});

	it("names every command, group, alias and nested command", () => {
		for (const name of [
			"terminals",
			"term",
			"read",
			"list",
			"tasks",
			"create",
			"completion",
			"status",
		]) {
			expect(script).toContain(name);
		}
	});

	it("offers each command's flags, their aliases, the globals and --help", () => {
		for (const flag of [
			"--workspace",
			"-w",
			"--terminal",
			"--priority",
			"--json",
			"--api-key",
			"--help",
			"--version",
		]) {
			expect(script).toContain(flag);
		}
	});

	it("offers enum values for flags and positionals", () => {
		for (const value of ["urgent", "high", "low", "bash", "zsh"]) {
			expect(script).toContain(value);
		}
	});

	it("leaves out hidden options and command-less groups", () => {
		expect(script).not.toContain("--secret");
		expect(script).not.toContain("orphan");
	});

	it("produces a script for an empty tree", () => {
		const empty = generate({ ...cli, root: node("", { hasCommand: false }) });
		expect(empty).toContain(marker);
	});
});

describe("generateZshCompletion", () => {
	it("escapes colons inside _describe entries", () => {
		expect(generateZshCompletion(cli)).toContain(
			"'--workspace:Workspace\\: id or name'",
		);
	});

	it.skipIf(!Bun.which("zsh"))("parses under zsh", () => {
		const result = Bun.spawnSync(["zsh", "-n"], {
			stdin: Buffer.from(generateZshCompletion(cli)),
		});
		expect(result.stderr.toString()).toBe("");
		expect(result.exitCode).toBe(0);
	});
});

describe("generateBashCompletion", () => {
	it("derives a valid function name from a hyphenated binary", () => {
		const script = generateBashCompletion({ ...cli, name: "my-cli" });
		expect(script).toContain("_my_cli() {");
		expect(script).toContain("complete -F _my_cli my-cli");
	});

	const script = generateBashCompletion(cli);

	/** What bash would offer with the cursor on the last word. */
	function complete(...words: string[]): string[] {
		const quoted = words.map((w) => `'${w}'`).join(" ");
		const program = [
			script,
			`COMP_WORDS=(${quoted})`,
			`COMP_CWORD=${words.length - 1}`,
			"_superset",
			`printf "%s\\n" "\${COMPREPLY[@]}"`,
		].join("\n");
		const result = Bun.spawnSync(["bash", "-c", program]);
		expect(result.stderr.toString()).toBe("");
		return result.stdout.toString().split("\n").filter(Boolean).sort();
	}

	it.skipIf(!Bun.which("bash"))("completes in a real bash", () => {
		expect(complete("superset", "term")).toEqual(["terminals"]);
		expect(complete("superset", "")).toEqual([
			"completion",
			"status",
			"tasks",
			"terminals",
		]);
		expect(complete("superset", "terminals", "")).toEqual(["list", "read"]);
		expect(complete("superset", "term", "re")).toEqual(["read"]);
		expect(complete("superset", "terminals", "read", "--")).toEqual([
			"--api-key",
			"--help",
			"--json",
			"--terminal",
			"--workspace",
		]);
		expect(complete("superset", "term", "read", "--w")).toEqual([
			"--workspace",
		]);
		expect(complete("superset", "terminals", "read", "-w", "x", "--t")).toEqual(
			["--terminal"],
		);
		expect(complete("superset", "-")).toEqual([
			"--api-key",
			"--help",
			"--json",
			"--version",
			"-h",
			"-v",
		]);
		expect(complete("superset", "tasks", "create", "--priority", "")).toEqual([
			"high",
			"low",
			"urgent",
		]);
		expect(complete("superset", "completion", "")).toEqual(["bash", "zsh"]);
		expect(complete("superset", "completion", "bash", "")).toEqual([]);
	});
});
