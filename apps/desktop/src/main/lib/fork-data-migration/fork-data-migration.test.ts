import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyForkData } from "./fork-data-migration";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function layout() {
	const root = mkdtempSync(join(tmpdir(), "fork-data-"));
	roots.push(root);
	const fromHome = join(root, ".superset");
	mkdirSync(join(fromHome, "host", "org"), { recursive: true });
	mkdirSync(join(fromHome, "worktrees", "repo"), { recursive: true });
	writeFileSync(join(fromHome, "local.db"), "db");
	writeFileSync(join(fromHome, "host", "org", "host.db"), "host");
	writeFileSync(join(fromHome, "host", "org", "manifest.json"), "{}");
	writeFileSync(join(fromHome, "auth-token.enc"), "token");
	writeFileSync(join(fromHome, "terminal-host.sock"), "");
	const fromProfile = join(root, "Superset");
	mkdirSync(join(fromProfile, "Local Storage"), { recursive: true });
	mkdirSync(join(fromProfile, "Cache"), { recursive: true });
	writeFileSync(join(fromProfile, "Local Storage", "state"), "tabs");
	return {
		fromHome,
		toHome: join(root, ".superset-fork"),
		fromProfile,
		toProfile: join(root, "Superset Fork"),
	};
}

describe("copyForkData", () => {
	test("copies settings and state but not worktrees, sign-in or live processes", () => {
		const paths = layout();
		expect(copyForkData(paths)).toBe(true);
		expect(readFileSync(join(paths.toHome, "local.db"), "utf8")).toBe("db");
		expect(
			readFileSync(join(paths.toHome, "host", "org", "host.db"), "utf8"),
		).toBe("host");
		expect(
			readFileSync(join(paths.toProfile, "Local Storage", "state"), "utf8"),
		).toBe("tabs");
		for (const left of [
			join(paths.toHome, "worktrees"),
			join(paths.toHome, "auth-token.enc"),
			join(paths.toHome, "terminal-host.sock"),
			join(paths.toHome, "host", "org", "manifest.json"),
			join(paths.toProfile, "Cache"),
		])
			expect(existsSync(left)).toBe(false);
	});

	test("never runs twice", () => {
		const paths = layout();
		copyForkData(paths);
		writeFileSync(join(paths.fromHome, "local.db"), "newer");
		expect(copyForkData(paths)).toBe(false);
		expect(readFileSync(join(paths.toHome, "local.db"), "utf8")).toBe("db");
	});
});
