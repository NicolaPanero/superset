import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SHA = "d450c93b0d5faeebd28a5bd62108fb052bfed37e";

function sync(options: {
	remote?: string;
	fetched?: string;
	apiFails?: boolean;
	args?: string[];
}) {
	const directory = mkdtempSync(join(tmpdir(), "fork-sync-release-"));
	const calls = join(directory, "calls");
	const releases = join(directory, "releases.json");
	writeFileSync(calls, "");
	writeFileSync(
		releases,
		JSON.stringify([
			{ tag_name: "desktop-v2.1.0", draft: true, prerelease: false },
			{ tag_name: "desktop-v2.0.1", draft: false, prerelease: true },
			{ tag_name: "cli-v9.9.9", draft: false, prerelease: false },
			{ tag_name: "desktop-v2.0.0", draft: false, prerelease: false },
			{ tag_name: "desktop-v1.9.0", draft: false, prerelease: false },
			{ tag_name: "desktop-v1.40.0", draft: false, prerelease: false },
		]),
	);
	writeFileSync(
		join(directory, "gh"),
		`#!/bin/bash
printf 'gh %s\\n' "$*" >> "$TEST_CALLS"
[ "$TEST_API_FAILS" = true ] && exit 1
case "$*" in
 'api --paginate repos/ParadevAI/Paradev/releases?per_page=100 --jq '*) exec jq -r "\${!#}" "$TEST_RELEASES" ;;
 'api repos/ParadevAI/Paradev/releases/tags/'*) exec jq -c --arg tag "\${2#repos/ParadevAI/Paradev/releases/tags/}" '.[] | select(.tag_name == $tag)' "$TEST_RELEASES" ;;
 'api repos/ParadevAI/Paradev/commits/'*' --jq .sha') echo ${SHA} ;;
 *) echo "Unexpected GitHub request: $*" >&2; exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	writeFileSync(
		join(directory, "git"),
		`#!/bin/bash
printf 'git %s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
 'rev-parse --show-toplevel') pwd ;;
 'symbolic-ref --short HEAD') echo fork/paradev-plusplus-v2 ;;
 'status --porcelain --untracked-files=no'|'check-ref-format '*|'remote set-url upstream '*|'remote add upstream '*|'update-ref '*) exit 0 ;;
 'remote get-url upstream') if [ -n "$TEST_REMOTE" ]; then echo "$TEST_REMOTE"; else exit 2; fi ;;
 'rev-parse --verify --quiet '*) exit 1 ;;
 'fetch --quiet --no-tags upstream refs/tags/'*) exit 0 ;;
 'rev-parse --verify '*incoming*) echo "$TEST_FETCHED" ;;
 'merge-base --is-ancestor '*) exit 0 ;;
 *) echo "Unexpected Git operation: $*" >&2; exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	try {
		const result = Bun.spawnSync(
			[
				"bash",
				resolve(import.meta.dir, "sync-upstream.sh"),
				...(options.args ?? []),
			],
			{
				cwd: directory,
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					TEST_CALLS: calls,
					TEST_RELEASES: releases,
					TEST_REMOTE: options.remote ?? "",
					TEST_FETCHED: options.fetched ?? SHA,
					TEST_API_FAILS: String(options.apiFails ?? false),
				},
			},
		);
		return {
			code: result.exitCode,
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
			calls: readFileSync(calls, "utf8"),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const run = test.skipIf(process.platform === "win32");

run(
	"automatic sync selects only the newest published stable Paradev desktop release",
	() => {
		const result = sync({});
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(
			`ParadevAI/Paradev desktop-v2.0.0 (${SHA})`,
		);
		expect(result.calls).toContain(`git merge-base --is-ancestor ${SHA} HEAD`);
		expect(result.calls).not.toContain("superset-sh");
	},
);

run("an upstream remote that still points to Superset is replaced", () => {
	const result = sync({
		remote: "https://github.com/superset-sh/superset.git",
	});
	expect(result.code).toBe(0);
	expect(result.calls).toContain(
		"git remote set-url upstream https://github.com/ParadevAI/Paradev.git",
	);
});

run("a missing upstream remote is added and an exact one is left alone", () => {
	const added = sync({});
	expect(added.calls).toContain(
		"git remote add upstream https://github.com/ParadevAI/Paradev.git",
	);
	const exact = sync({ remote: "https://github.com/ParadevAI/Paradev.git" });
	expect(exact.calls).not.toContain("remote set-url");
	expect(exact.calls).not.toContain("remote add");
});

run("a fetched commit that differs from the release API stops the sync", () => {
	const result = sync({ fetched: "0".repeat(40) });
	expect(result.code).toBe(65);
	expect(result.stderr).toContain("does not match the release API SHA");
	expect(result.calls).not.toContain("merge-base");
});

run("an API failure is not treated as a release to integrate", () => {
	const result = sync({ apiFails: true });
	expect(result.code).not.toBe(0);
	expect(result.calls).not.toContain("merge-base");
	expect(result.calls).not.toContain("git fetch");
});

run("an unstable or non desktop tag is refused before any request", () => {
	for (const tag of ["cli-v9.9.9", "desktop-v2.0.1-canary.1", "desktop-v2.0"]) {
		const result = sync({ args: [tag] });
		expect(result.code).toBe(64);
		expect(result.calls).not.toContain("releases/tags");
	}
});

run("a draft release cannot be selected explicitly", () => {
	const result = sync({ args: ["desktop-v2.1.0"] });
	expect(result.code).toBe(65);
	expect(result.calls).not.toContain("git fetch");
});

run("publishing a branch other than the verified proposal is refused", () => {
	const result = sync({ args: ["--push"] });
	expect(result.code).toBe(64);
	expect(result.stderr).toContain("proposal branch");
});

run(
	"the expected SHA of a prepared proposal must still match the release",
	() => {
		const result = sync({ args: ["--expected-sha", "1".repeat(40)] });
		expect(result.code).toBe(65);
		expect(result.stderr).toContain("changed after preparation");
	},
);
