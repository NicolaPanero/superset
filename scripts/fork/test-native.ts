import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const helper = resolve(
	process.argv[2] ??
		resolve(
			root,
			`apps/desktop/dist/resources/bin/txcript-transfer${process.platform === "win32" ? ".exe" : ""}`,
		),
);
if (!existsSync(helper))
	throw new Error(
		"Build or supply the pinned txcript-transfer helper before running native tests",
	);
const staging = mkdtempSync(join(tmpdir(), "fork-native-test-loader-"));
try {
	const preload = join(staging, "helper.ts");
	const importer = join(staging, "opencode.exe");
	if (process.platform === "win32") {
		const compiled = Bun.spawnSync(
			[
				process.execPath,
				"build",
				resolve(root, "scripts/fork/opencode-fixture.ts"),
				"--compile",
				"--outfile",
				importer,
			],
			{ stdout: "inherit", stderr: "inherit" },
		);
		if (compiled.exitCode !== 0)
			throw new Error("Cannot compile isolated OpenCode importer");
	}
	writeFileSync(
		preload,
		`Reflect.set(globalThis,Symbol.for("superset.fork.testHelper"),${JSON.stringify(helper)});Reflect.set(globalThis,Symbol.for("superset.fork.testImporter"),${JSON.stringify(importer)});`,
	);
	const child = Bun.spawn(
		[
			process.execPath,
			"test",
			"--preload",
			resolve(root, "packages/host-service/test/setup-env.ts"),
			"--preload",
			preload,
			resolve(
				root,
				"packages/host-service/src/session-transfer/fork-native-helper.native-test.ts",
			),
		],
		{ cwd: root, stdout: "inherit", stderr: "inherit" },
	);
	process.exitCode = await child.exited;
} finally {
	rmSync(staging, { recursive: true, force: true });
}
