import { chmod, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Tag v0.14.4-fork.3 of the owner's txcript fork: official txcript at
// 8cd3b0e plus the fixes this fork needs (see FORK.md there).
const revision = "0d56ce01510fd1bc125ef77d3e9034441d70f812";
const repository = "https://github.com/NicolaPanero/txcript.git";
const repoRoot = resolve(import.meta.dir, "..");
const cache = join(repoRoot, ".cache/txcript-transfer", revision);
const targetHome =
	process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");

function run(args: string[], cwd = repoRoot) {
	const result = Bun.spawnSync(args, {
		cwd,
		env: process.env,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) throw new Error(`Command failed: ${args[0]}`);
}

run(["cargo", "--version"]);
if (!(await Bun.file(join(cache, ".git/HEAD")).exists())) {
	await mkdir(cache, { recursive: true });
	run(["git", "clone", "--no-checkout", repository, cache]);
}
run(["git", "checkout", "--detach", revision], cache);
run(
	[
		"cargo",
		"build",
		"-p",
		"txcript",
		"--locked",
		"--release",
		"--example",
		"superset-transfer",
		"--no-default-features",
		"--features",
		"opencode",
	],
	cache,
);
const binary = join(cache, "target/release/examples/superset-transfer");
const capability = Bun.spawnSync([binary, "capabilities"], {
	stdout: "pipe",
	stderr: "inherit",
});
const details = JSON.parse(capability.stdout.toString());
if (
	capability.exitCode !== 0 ||
	details.protocolVersion !== 1 ||
	details.engineVersion !== "0.14.4-fork.3" ||
	!details.conversionOnly
)
	throw new Error("Invalid transfer helper");
const output = join(targetHome, "bin", "txcript-transfer");
await mkdir(join(targetHome, "bin"), { recursive: true });
const temporary = `${output}.${crypto.randomUUID()}.tmp`;
await copyFile(binary, temporary);
await chmod(temporary, 0o700);
await rename(temporary, output);
await writeFile(
	`${output}.provenance.json`,
	JSON.stringify(
		{
			repository,
			revision,
			engineVersion: details.engineVersion,
		},
		null,
		2,
	),
);
console.log(`Installed conversion-only helper: ${output}`);
