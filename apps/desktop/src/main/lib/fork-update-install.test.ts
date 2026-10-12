import { expect, mock, test } from "bun:test";
import {
	forkInstallAsset,
	installedForkAppPath,
	restartPreparedForkUpdate,
	waitForForkInstaller,
} from "./fork-update-install";

const repository = "NicolaPanero/superset";
const tag = "desktop-v1.37.0-fork.454baf2-tx8";
const url = `https://github.com/${repository}/releases/download/${tag}/Superset-fork-arm64.zip`;
const body = {
	tag_name: tag,
	assets: [
		{
			name: "Superset-fork-arm64.zip",
			browser_download_url: url,
			digest: `sha256:${"a".repeat(64)}`,
		},
	],
};
test("an offer pins the archive and its digest to the exact fork release", () => {
	expect(forkInstallAsset(body, repository)).toEqual({
		tag,
		url,
		sha256: "a".repeat(64),
	});
	for (const change of [
		{ digest: null },
		{ digest: "sha256:bad" },
		{ browser_download_url: "https://example.invalid/app.zip" },
	])
		expect(() =>
			forkInstallAsset(
				{ ...body, assets: [{ ...body.assets[0], ...change }] },
				repository,
			),
		).toThrow();
});
test("install targets the actual app bundle, including user Applications with spaces", () => {
	expect(
		installedForkAppPath(
			"/Applications/Superset++.app/Contents/MacOS/Superset++",
		),
	).toBe("/Applications/Superset++.app");
	expect(
		installedForkAppPath(
			"/Users/Fake User/Applications/Superset++.app/Contents/MacOS/Superset++",
		),
	).toBe("/Users/Fake User/Applications/Superset++.app");
	expect(() =>
		installedForkAppPath("/Applications/Superset.app/Contents/MacOS/Superset"),
	).toThrow();
});
function fixture(initial = "downloading") {
	let status = initial;
	let poll = () => {};
	let deadline = () => {};
	let failure = (_error: Error) => {};
	const abort = new AbortController();
	const dispose = mock(() => {}),
		cancel = mock(() => {});
	const ready = waitForForkInstaller({
		signal: abort.signal,
		readStatus: () => status,
		cancel,
		subscribe(callback) {
			failure = callback;
			return dispose;
		},
		poll(callback) {
			poll = callback;
			return dispose;
		},
		deadline(callback) {
			deadline = callback;
			return dispose;
		},
	});
	return {
		ready,
		abort,
		cancel,
		dispose,
		phase(value: string) {
			status = value;
			poll();
		},
		deadline: () => deadline(),
		failed: (error: Error) => failure(error),
	};
}
test("restarting is gated on verified preparation, never on starting a downloader", async () => {
	const f = fixture();
	const restart = mock(() => {});
	const exit = mock(() => {});
	const scheduled: (() => void)[] = [];
	const operation = restartPreparedForkUpdate({
		prepare: () => f.ready,
		signal: f.abort.signal,
		restart,
		forceExit: exit,
		scheduleExit(callback, delay) {
			expect(delay).toBe(15000);
			scheduled.push(callback);
		},
	});
	await Promise.resolve();
	expect(restart).not.toHaveBeenCalled();
	f.phase("downloading");
	await Promise.resolve();
	expect(restart).not.toHaveBeenCalled();
	f.phase("ready");
	await operation;
	expect(restart).toHaveBeenCalledTimes(1);
	expect(scheduled).toHaveLength(1);
	scheduled[0]?.();
	expect(exit).toHaveBeenCalledTimes(1);
	expect(f.cancel).not.toHaveBeenCalled();
	expect(f.dispose).toHaveBeenCalledTimes(3);
	f.deadline();
	expect(f.cancel).not.toHaveBeenCalled();
});
test.each([
	"failed",
	"exit",
	"timeout",
	"cancel",
])("%s during preparation stops the installer and keeps the app open", async (kind) => {
	const f = fixture();
	const restart = mock(() => {});
	const exit = mock(() => {});
	const scheduled: (() => void)[] = [];
	const operation = restartPreparedForkUpdate({
		prepare: () => f.ready,
		signal: f.abort.signal,
		restart,
		forceExit: exit,
		scheduleExit(callback, delay) {
			expect(delay).toBe(15000);
			scheduled.push(callback);
		},
	});
	if (kind === "failed") f.phase("failed");
	if (kind === "exit") f.failed(new Error("spawn or download failure"));
	if (kind === "timeout") f.deadline();
	if (kind === "cancel") f.abort.abort();
	await expect(operation).rejects.toThrow();
	expect(restart).not.toHaveBeenCalled();
	expect(f.cancel).toHaveBeenCalledTimes(1);
	expect(scheduled).toHaveLength(0);
	expect(exit).not.toHaveBeenCalled();
	expect(f.dispose).toHaveBeenCalledTimes(3);
	f.phase("ready");
	expect(restart).not.toHaveBeenCalled();
});
