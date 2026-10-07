import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const revision = "8cd3b0e63f797b1531a14197f41a0e9eeedec8c6";
const repository = "https://github.com/skillsynchq/txcript.git";
const repoRoot = resolve(import.meta.dir, "..");
const patch = join(repoRoot, "tools/txcript-transfer/native-transfer.patch");
const digest = createHash("sha256")
	.update(Buffer.from(await Bun.file(patch).arrayBuffer()))
	.digest("hex");
const cache = join(
	repoRoot,
	".cache/txcript-transfer",
	`${revision}-${digest.slice(0, 12)}`,
);
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
if (!(await Bun.file(join(cache, ".superset-patched")).exists())) {
	await mkdir(cache, { recursive: true });
	if (!(await Bun.file(join(cache, ".git/HEAD")).exists()))
		run(["git", "clone", "--no-checkout", repository, cache]);
	run(["git", "checkout", "--detach", revision], cache);
	run(["git", "apply", "--check", patch], cache);
	run(["git", "apply", patch], cache);
	await writeFile(join(cache, ".superset-patched"), digest);
}
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
			patchSha256: digest,
			engineVersion: details.engineVersion,
		},
		null,
		2,
	),
);
console.log(`Installed conversion-only helper: ${output}`);
