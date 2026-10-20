import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	antigravityDistribution,
	resolveAntigravityRuntime,
} from "./forkAntigravityRuntime";

test("concurrent Google launches share installation and later launches use the cache", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "fork-google-install-"));
	const root = join(temporary, "cache");
	const binaries = antigravityDistribution(process.platform, process.arch);
	let downloads = 0;
	const download = async (url: string) => {
		downloads++;
		expect(url).toBe(binaries.url);
		return Buffer.from("official archive fixture");
	};
	const extract = async (_zip: string, dest: string) => {
		for (const binary of [binaries.command, binaries.harness])
			await writeFile(join(dest, binary), "native fixture", { mode: 0o700 });
	};
	try {
		const first = resolveAntigravityRuntime({ root, download, extract });
		const second = resolveAntigravityRuntime({ root, download, extract });
		expect(first).toBe(second);
		expect(await first).toBe(join(root, binaries.command));
		await second;
		await resolveAntigravityRuntime({ root, download, extract });
		expect(downloads).toBe(1);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
test("an incomplete download cannot replace an existing runtime or leave staging files", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "fork-google-failure-"));
	const root = join(temporary, "cache");
	const binaries = antigravityDistribution(process.platform, process.arch);
	await mkdir(root);
	await writeFile(join(root, binaries.command), "previous", { mode: 0o700 });
	try {
		await expect(
			resolveAntigravityRuntime({
				root,
				download: async () => Buffer.from("fixture"),
				extract: async (_zip, dest) => {
					await writeFile(join(dest, binaries.command), "incomplete");
				},
			}),
		).rejects.toThrow();
		expect(await readFile(join(root, binaries.command), "utf8")).toBe(
			"previous",
		);
		const { readdir } = await import("node:fs/promises");
		expect(await readdir(dirname(root))).toEqual(["cache"]);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
