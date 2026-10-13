import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forkInstallAsset } from "./fork-update-install";
import {
	downloadWindowsInstaller,
	windowsForkApplication,
} from "./fork-windows-update";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
const bytes = Buffer.from("synthetic Windows installer");
const asset = {
	tag: "desktop-v1.37.0-fork.test-tx12",
	url: "https://example.invalid/fixture.exe",
	sha256: createHash("sha256").update(bytes).digest("hex"),
};
async function destination() {
	const root = await mkdtemp(join(tmpdir(), "fork-download-"));
	roots.push(root);
	return join(root, "setup.exe");
}
function request(response: Response) {
	return async () => response;
}
test("Windows updates choose the verified installer from the same release", () => {
	const repository = "NicolaPanero/superset";
	const url = `https://github.com/${repository}/releases/download/${asset.tag}/Superset-fork-x64.exe`;
	const body = {
		tag_name: asset.tag,
		assets: [
			{
				name: "Superset-fork-x64.exe",
				browser_download_url: url,
				digest: `sha256:${asset.sha256}`,
			},
		],
	};
	expect(forkInstallAsset(body, repository, "win32")).toEqual({
		...asset,
		url,
	});
	expect(() => forkInstallAsset(body, repository, "darwin")).toThrow();
	expect(() =>
		forkInstallAsset(body, "superset-sh/superset", "win32"),
	).toThrow();
	expect(() =>
		forkInstallAsset(
			{ ...body, assets: [{ ...body.assets[0], digest: null }] },
			repository,
			"win32",
		),
	).toThrow();
});
test("installer streams to staging and commits only after digest verification", async () => {
	const path = await destination();
	await downloadWindowsInstaller(
		asset,
		path,
		new AbortController().signal,
		request(new Response(bytes)),
	);
	expect(await readFile(path)).toEqual(bytes);
	expect(existsSync(`${path}.download`)).toBe(false);
});
test("corrupt installer never becomes executable", async () => {
	const path = await destination();
	await expect(
		downloadWindowsInstaller(
			asset,
			path,
			new AbortController().signal,
			request(new Response("corrupt")),
		),
	).rejects.toThrow("checksum");
	expect(existsSync(path)).toBe(false);
	expect(existsSync(`${path}.download`)).toBe(false);
});
test("cancellation deletes partial download and preserves the installed app", async () => {
	const path = await destination(),
		abort = new AbortController();
	abort.abort();
	await expect(
		downloadWindowsInstaller(
			asset,
			path,
			abort.signal,
			request(new Response(bytes)),
		),
	).rejects.toThrow();
	expect(existsSync(path)).toBe(false);
	expect(existsSync(`${path}.download`)).toBe(false);
});
test("failed or oversized downloads do not prepare an installer", async () => {
	for (const response of [
		new Response("error", { status: 503 }),
		new Response(bytes, {
			headers: { "content-length": String(4 * 1024 ** 3) },
		}),
	]) {
		const path = await destination();
		await expect(
			downloadWindowsInstaller(
				asset,
				path,
				new AbortController().signal,
				request(response),
			),
		).rejects.toThrow();
		expect(existsSync(path)).toBe(false);
	}
});
test("Windows app location accepts Unicode and spaces and rejects other apps", () => {
	const executable =
		"C:\\Users\\Niccolò Test\\AppData\\Local\\Programs\\Superset++\\Superset++.exe";
	expect(windowsForkApplication(executable)).toEqual({
		executable,
		directory: executable.slice(0, -15),
	});
	expect(() =>
		windowsForkApplication("C:\\Apps\\Superset\\Superset.exe"),
	).toThrow();
	expect(() => windowsForkApplication("Superset++.exe")).toThrow();
});
