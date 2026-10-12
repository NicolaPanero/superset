import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const suiteRoots = [
	"scripts/fork",
	"apps/desktop/src",
	"packages/shared/src",
	"packages/host-service/src",
	"packages/host-service/test/integration",
	"packages/chat-runtime/src",
];
const extra = [
	"apps/desktop/fork-identity.test.ts",
	"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ForkChatExtras/utils",
	"packages/host-service/src/session-transfer",
	"packages/host-service/src/chat-v3/backgroundChats.test.ts",
	"packages/host-service/src/chat-v3/cursorSessionBridge/cursorSessionBridge.test.ts",
	"packages/host-service/src/trpc/router/agents/account-selection.test.ts",
	"packages/host-service/src/trpc/router/agents/agents.test.ts",
	"packages/host-service/src/trpc/router/settings/agent-configs.test.ts",
	"packages/host-service/src/trpc/router/usage/default-account.test.ts",
	"packages/host-service/src/trpc/router/workspace-creation/utils/workspace-naming-job.test.ts",
	"packages/chat-runtime/src/harness/acp/cursorExtensions.test.ts",
];
const files = suiteRoots.flatMap((directory) =>
	readdirSync(resolve(root, directory), {
		recursive: true,
		withFileTypes: true,
	})
		.filter((entry) => entry.isFile() && /\.test\.tsx?$/.test(entry.name))
		.map((entry) => relative(root, resolve(entry.parentPath, entry.name))),
);
for (const path of extra) {
	if (!existsSync(resolve(root, path)))
		throw new Error(`Missing fork regression target: ${path}`);
	if (statSync(resolve(root, path)).isFile() && !files.includes(path))
		files.push(path);
}
const selected = files.filter(
	(file) =>
		/fork/i.test(file) ||
		extra.some((path) => file === path || file.startsWith(`${path}/`)),
);
const groups = [
	{
		name: "desktop",
		cwd: "apps/desktop",
		files: selected.filter((file) => file.startsWith("apps/desktop/")),
	},
	{
		name: "unit and runtime",
		cwd: ".",
		files: selected.filter(
			(file) =>
				!file.startsWith("apps/desktop/") &&
				!file.includes("/test/integration/"),
		),
	},
	{
		name: "host integration",
		cwd: ".",
		files: selected.filter((file) => file.includes("/test/integration/")),
	},
];
if (process.argv.includes("--list")) {
	for (const group of groups)
		console.log(
			`${group.name}: ${group.files.length} files\n${group.files.sort().join("\n")}`,
		);
} else {
	const catalogBuild = Bun.spawn([process.execPath, "run", "compile"], {
		cwd: resolve(root, "packages/i18n"),
		stdout: "inherit",
		stderr: "inherit",
	});
	const catalogCode = await catalogBuild.exited;
	if (catalogCode !== 0) process.exit(catalogCode);
	for (const group of groups) {
		if (!group.files.length)
			throw new Error(`Empty fork test group: ${group.name}`);
		console.log(`\nFork tests: ${group.name} (${group.files.length} files)`);
		const cwd = resolve(root, group.cwd);
		const command = [
			process.execPath,
			"test",
			"--isolate",
			"--preload",
			resolve(root, "packages/host-service/test/setup-env.ts"),
			...group.files.sort().map((file) => relative(cwd, resolve(root, file))),
		];
		const child = Bun.spawn(command, {
			cwd,
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, NODE_ENV: "test", SKIP_ENV_VALIDATION: "1" },
		});
		const code = await child.exited;
		if (code !== 0) process.exit(code);
	}
}
