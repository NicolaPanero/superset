import { expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function propose(mode: string) {
	const directory = mkdtempSync(join(tmpdir(), "fork-upstream-pr-"));
	mkdirSync(join(directory, "scripts/fork"), { recursive: true });
	copyFileSync(
		join(import.meta.dir, "sync-upstream.sh"),
		join(directory, "scripts/fork/sync-upstream.sh"),
	);
	const calls = join(directory, "calls");
	writeFileSync(calls, "");
	writeFileSync(
		join(directory, "git"),
		`#!/bin/bash
printf 'git %s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
 'rev-parse --show-toplevel') pwd ;;
 'ls-remote '*) if [ "$TEST_MODE" = recover ]; then exit 0; else exit 2; fi ;;
 'checkout -b '*|'fetch '*|'remote get-url '*|'status --porcelain '*) exit 0 ;;
 'symbolic-ref --short HEAD') echo fork/sync-desktop-v1.38.0 ;;
 'rev-parse HEAD') if [ -f merged ]; then echo new-fork-sha; else echo original-fork-sha; fi ;;
 'rev-parse desktop-'*) echo official-release-sha ;;
 'merge-base --is-ancestor origin/fork/main HEAD') exit 0 ;;
 'merge-base --is-ancestor '*) if [ "$TEST_MODE" = integrated ]; then exit 0; else exit 1; fi ;;
 'rev-list --count '*) echo 2 ;;
 'merge --no-edit '*) if [ "$TEST_MODE" = conflict ]; then exit 1; else touch merged; fi ;;
 'diff --name-only --diff-filter=U') echo src/chat.ts ;;
 'merge --abort') exit 0 ;;
 'push origin '*) case "$*" in *:refs/heads/fork/main) exit 99;; esac ;;
 *) echo "Unexpected Git operation: $*" >&2; exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	writeFileSync(
		join(directory, "gh"),
		`#!/bin/bash
printf 'gh %s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
 'pr list '*) if [ "$TEST_MODE" = existing ]; then echo https://example.test/existing-pr; fi ;;
 'pr create '*) while [ "$#" -gt 0 ]; do if [ "$1" = --body-file ]; then cp "$2" "$TEST_BODY"; fi; shift; done; echo https://example.test/new-pr ;;
 *) echo "Unexpected GitHub operation: $*" >&2; exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	try {
		const result = Bun.spawnSync(
			[
				"bash",
				join(import.meta.dir, "prepare-upstream-pr.sh"),
				"desktop-v1.38.0",
			],
			{
				cwd: directory,
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					GITHUB_REPOSITORY: "test/fork",
					TEST_MODE: mode,
					TEST_CALLS: calls,
					TEST_BODY: join(directory, "body"),
				},
			},
		);
		if (result.exitCode !== 0)
			throw new Error(
				`${result.stdout.toString()}\n${result.stderr.toString()}`,
			);
		return {
			calls: readFileSync(calls, "utf8"),
			stdout: result.stdout.toString(),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
const run = test.skipIf(process.platform === "win32");
run(
	"a clean upstream merge is pushed only to a proposal branch and opens a PR",
	() => {
		const result = propose("clean");
		expect(result.calls).toContain(
			"git push origin HEAD:refs/heads/fork/sync-desktop-v1.38.0",
		);
		expect(result.calls).toContain("gh pr create");
		expect(result.calls).not.toContain("--draft");
		expect(result.calls).not.toContain("--auto");
	},
);
run(
	"conflicts open a draft pointing to the official commit without updating fork/main",
	() => {
		const result = propose("conflict");
		expect(result.calls).toContain("git merge --abort");
		expect(result.calls).toContain(
			"git push origin official-release-sha:refs/heads/fork/sync-desktop-v1.38.0",
		);
		expect(result.calls).toContain("--draft");
	},
);
run(
	"an existing proposal is not reopened or rebuilt on the following daily sync",
	() => {
		const result = propose("existing");
		expect(result.calls).not.toContain("git push");
		expect(result.calls).not.toContain("gh pr create");
	},
);
run(
	"recovering a pushed branch preserves manual fixes and does not force-push it",
	() => {
		const result = propose("recover");
		expect(result.calls).toContain("FETCH_HEAD");
		expect(result.calls).not.toContain("git merge --no-edit");
		expect(result.calls).not.toContain("git push");
		expect(result.calls).toContain("gh pr create");
	},
);
run(
	"a release integrated during the sync needs no new branch push or PR",
	() => {
		const result = propose("integrated");
		expect(result.calls).not.toContain("git push");
		expect(result.calls).not.toContain("gh pr create");
	},
);
