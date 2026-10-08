import { createHash } from "node:crypto";
import {
	chmod,
	copyFile,
	mkdir,
	mkdtemp,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// The transfer helper is published prebuilt by the owner's txcript fork
// (official txcript plus the fixes Superset needs; see FORK.md there). The
// latest release is installed unless TXCRIPT_TAG names one.
const repository = "NicolaPanero/txcript";
const asset = "superset-transfer-aarch64-apple-darwin.tar.gz";
// txcript's own CLI lists the sessions on this Mac for "Import chat".
const cliAsset = "txcript-aarch64-apple-darwin.tar.gz";
const targetHome =
	process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");

if (process.platform !== "darwin" || process.arch !== "arm64")
	throw new Error("The prebuilt transfer helper is for Apple Silicon Macs");

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
async function download(url: string, json = false) {
	const response = await fetch(url, {
		headers: {
			"User-Agent": "superset-fork-build",
			...(token && url.startsWith("https://api.github.com")
				? { Authorization: `Bearer ${token}` }
				: {}),
		},
	});
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return json ? response.json() : Buffer.from(await response.arrayBuffer());
}

const tag: string =
	process.env.TXCRIPT_TAG ||
	(
		(await download(
			`https://api.github.com/repos/${repository}/releases/latest`,
			true,
		)) as { tag_name: string }
	).tag_name;
if (!/^v\d+\.\d+\.\d+-fork\.\d+$/.test(tag))
	throw new Error(`Unexpected txcript release ${tag}`);
const base = `https://github.com/${repository}/releases/download/${tag}`;
const archive = (await download(`${base}/${asset}`)) as Buffer;
const sums = ((await download(`${base}/SHA256SUMS`)) as Buffer).toString();
function verify(name: string, data: Buffer) {
	const digest = createHash("sha256").update(data).digest("hex");
	if (!sums.split("\n").some((line) => line.trim() === `${digest}  ${name}`))
		throw new Error(`${name} of ${tag} does not match SHA256SUMS`);
	return digest;
}
const sha256 = verify(asset, archive);
const cliArchive = (await download(`${base}/${cliAsset}`)) as Buffer;
verify(cliAsset, cliArchive);

const work = await mkdtemp(join(tmpdir(), "superset-transfer-"));
try {
	await writeFile(join(work, asset), archive);
	const extract = Bun.spawnSync(["tar", "-xzf", asset], {
		cwd: work,
		stderr: "inherit",
	});
	if (extract.exitCode !== 0) throw new Error(`Could not extract ${asset}`);
	const binary = join(work, "superset-transfer");
	const capability = Bun.spawnSync([binary, "capabilities"], {
		stdout: "pipe",
		stderr: "inherit",
	});
	const details = JSON.parse(capability.stdout.toString());
	if (
		capability.exitCode !== 0 ||
		details.protocolVersion !== 1 ||
		details.engineVersion !== tag.slice(1) ||
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
			{ repository, tag, sha256, engineVersion: details.engineVersion },
			null,
			2,
		),
	);
	console.log(`Installed transfer helper ${tag}: ${output}`);

	await writeFile(join(work, cliAsset), cliArchive);
	const cliExtract = Bun.spawnSync(["tar", "-xzf", cliAsset], {
		cwd: work,
		stderr: "inherit",
	});
	if (cliExtract.exitCode !== 0)
		throw new Error(`Could not extract ${cliAsset}`);
	const cli = join(work, "txcript");
	const listing = Bun.spawnSync(
		[cli, "list", "--json", "-n", "1", "--cwd", work],
		{ stdout: "pipe", stderr: "inherit" },
	);
	if (
		listing.exitCode !== 0 ||
		!Array.isArray(JSON.parse(listing.stdout.toString()))
	)
		throw new Error("txcript CLI cannot list sessions as JSON");
	const cliOutput = join(targetHome, "bin", "txcript-cli");
	const cliTemporary = `${cliOutput}.${crypto.randomUUID()}.tmp`;
	await copyFile(cli, cliTemporary);
	await chmod(cliTemporary, 0o700);
	await rename(cliTemporary, cliOutput);
	console.log(`Installed txcript CLI ${tag}: ${cliOutput}`);
} finally {
	await rm(work, { recursive: true, force: true });
}
