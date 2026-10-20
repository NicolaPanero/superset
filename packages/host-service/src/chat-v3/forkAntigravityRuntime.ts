import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
	access,
	chmod,
	mkdir,
	mkdtemp,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { getBinDir } from "@superset/agent-setup";

export const ANTIGRAVITY_ACP_VERSION = "1.3.0";
export function antigravityDistribution(
	platform: NodeJS.Platform,
	arch: string,
) {
	if (
		!["darwin", "win32", "linux"].includes(platform) ||
		!["arm64", "x64"].includes(arch)
	)
		throw new Error("antigravity_platform_unsupported");
	const system =
		platform === "darwin"
			? "macos"
			: platform === "win32"
				? "windows"
				: "linux";
	const suffix = `${platform === "win32" ? "windows" : platform}-${arch === "x64" ? "x86_64" : arch}`;
	return {
		url: `https://dl.google.com/agy-extensions/releases/${system}/agy-acp-server-${ANTIGRAVITY_ACP_VERSION}-${suffix}.zip`,
		command: platform === "win32" ? "agy_acp_server.exe" : "agy_acp_server.par",
		harness:
			platform === "win32"
				? "localharness_external.exe"
				: "localharness_external",
		args: platform === "linux" ? ["--uid="] : [],
	};
}
const inflight = new Map<string, Promise<string>>();
const execute = promisify(execFile);
type RuntimeInstall = {
	root?: string;
	download?: (url: string) => Promise<Buffer>;
	extract?: (zip: string, destination: string) => Promise<void>;
};
async function downloadArchive(url: string) {
	const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
	if (!response.ok)
		throw new Error(`antigravity_download_failed: HTTP ${response.status}`);
	if (Number(response.headers.get("content-length")) > 512 * 1024 * 1024)
		throw new Error("antigravity_download_too_large");
	return Buffer.from(await response.arrayBuffer());
}
async function extractArchive(zip: string, destination: string) {
	if (process.platform === "win32")
		await execute(
			join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"),
			["-xf", zip, "-C", destination],
		);
	else await execute("unzip", ["-q", zip, "-d", destination]);
}
async function installRuntime(
	root: string,
	distribution: ReturnType<typeof antigravityDistribution>,
	options: RuntimeInstall,
) {
	const command = join(root, distribution.command);
	try {
		await access(command, constants.X_OK);
		await access(join(root, distribution.harness), constants.X_OK);
		return command;
	} catch {}
	await mkdir(dirname(root), { recursive: true });
	const staging = await mkdtemp(join(dirname(root), ".antigravity-"));
	try {
		const archive = await (options.download ?? downloadArchive)(
			distribution.url,
		);
		if (archive.length > 512 * 1024 * 1024)
			throw new Error("antigravity_download_too_large");
		const zip = join(staging, "runtime.zip");
		const extracted = join(staging, "runtime");
		await writeFile(zip, archive);
		await mkdir(extracted);
		await (options.extract ?? extractArchive)(zip, extracted);
		for (const binary of [distribution.command, distribution.harness]) {
			await chmod(join(extracted, binary), 0o700);
			await access(join(extracted, binary), constants.X_OK);
		}
		await rm(root, { recursive: true, force: true });
		await rename(extracted, root);
		return command;
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}
export function resolveAntigravityRuntime(
	options: RuntimeInstall = {},
): Promise<string> {
	const distribution = antigravityDistribution(process.platform, process.arch);
	const root =
		options.root ??
		join(
			dirname(getBinDir()),
			"acp",
			"antigravity",
			ANTIGRAVITY_ACP_VERSION,
			`${process.platform}-${process.arch}`,
		);
	let installation = inflight.get(root);
	if (!installation) {
		installation = installRuntime(root, distribution, options).finally(() =>
			inflight.delete(root),
		);
		inflight.set(root, installation);
	}
	return installation;
}
