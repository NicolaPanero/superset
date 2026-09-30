import { afterAll, describe, expect, mock, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliContext } from "../../lib/command";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-status-"));
process.env.SUPERSET_HOME_DIR = tempHome;

// Imports below must come after SUPERSET_HOME_DIR is set: config.ts and
// manifest.ts both read it once at module load.
const { writeManifest } = await import("../../lib/host/manifest");
const statusCommand = (await import("./command")).default;

const fakeHostBinDir = mkdtempSync(join(tmpdir(), "superset-cli-fake-host-"));
const fakeHostBinPath = join(fakeHostBinDir, "superset-host");
writeFileSync(fakeHostBinPath, "#!/bin/sh\nsleep 30\n");
chmodSync(fakeHostBinPath, 0o755);

// Spawns the script above rather than overriding argv0 on an unrelated
// binary — `ps`'s rendering of an overridden argv0 isn't portable across
// kernels/ps implementations, but the path a process was actually exec'd
// from always is.
function spawnFakeHostProcess(): ChildProcess {
	return spawn(fakeHostBinPath, [], { stdio: "ignore" });
}

afterAll(() => {
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
	rmSync(fakeHostBinDir, { recursive: true, force: true });
});

const ORG = { id: "org-1", slug: "org-1", name: "Palette" };

function makeCtx(): CliContext {
	const query = mock(async () => [ORG]);
	const hostListQuery = mock(async () => []);
	return {
		api: {
			user: { myOrganizations: { query } },
			host: { list: { query: hostListQuery } },
		},
		config: {},
		bearer: "bearer-token",
		authSource: "apiKey",
	} as unknown as CliContext;
}

type Result = { data: Record<string, unknown>; message?: string };

function run(): Promise<Result> {
	return statusCommand.run({
		ctx: makeCtx(),
		args: {},
		options: { org: undefined },
		signal: new AbortController().signal,
	} as never) as Promise<Result>;
}

describe("superset status manifest liveness", () => {
	test("reports not running when there is no manifest", async () => {
		const result = await run();
		expect(result.data).toMatchObject({ running: false });
		expect(result.message).toContain("Not running");
	});

	test("reports a stale manifest when the recorded pid is dead", async () => {
		writeManifest({
			pid: 999_999,
			endpoint: "http://127.0.0.1:19991",
			authToken: "secret",
			startedAt: Date.now(),
			organizationId: ORG.id,
		});

		const result = await run();
		expect(result.data).toMatchObject({
			running: false,
			stale: true,
			pid: 999_999,
		});
		expect(result.message).toContain("is dead");
	});

	test("reports a stale manifest when the recorded pid is alive but belongs to a different process (pid reuse)", async () => {
		// The current test-runner process is alive, but it is certainly not
		// the superset-host binary — reproducing the bug report's scenario
		// where an unrelated process inherits a pid the manifest still names.
		writeManifest({
			pid: process.pid,
			endpoint: "http://127.0.0.1:19992",
			authToken: "secret",
			startedAt: Date.now(),
			organizationId: ORG.id,
		});

		const result = await run();
		expect(result.data).toMatchObject({
			running: false,
			stale: true,
			pid: process.pid,
		});
		expect(result.message).toContain("belongs to a different process");
	});

	test("reports a running host when the pid matches the host binary (unchanged behavior)", async () => {
		// Fakes a live host-service by spawning a script literally named
		// "superset-host" — enough for the identity check without spinning up
		// the real service. Its actual health endpoint isn't listening, which
		// only affects the `healthy` flag, not `running`.
		const fakeHost = spawnFakeHostProcess();
		await new Promise((resolve) => setTimeout(resolve, 100));
		try {
			writeManifest({
				pid: fakeHost.pid as number,
				endpoint: "http://127.0.0.1:19993",
				authToken: "secret",
				startedAt: Date.now(),
				organizationId: ORG.id,
			});

			const result = await run();
			expect(result.data).toMatchObject({
				running: true,
				pid: fakeHost.pid,
			});
			expect(result.message).not.toContain("Stale");
		} finally {
			fakeHost.kill();
		}
	});
});
