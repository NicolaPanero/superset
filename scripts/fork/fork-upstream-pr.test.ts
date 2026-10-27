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

const TAG = "desktop-v2.0.0";
const SHA = "d450c93b0d5faeebd28a5bd62108fb052bfed37e";
const HEAD = `fork/sync-paradev-${TAG}-${SHA.slice(0, 12)}`;

function propose(mode: string, env: Record<string, string> = {}) {
	const directory = mkdtempSync(join(tmpdir(), "fork-upstream-pr-"));
	mkdirSync(join(directory, "scripts/fork"), { recursive: true });
	for (const file of [
		"sync-upstream.sh",
		"fork-upstream-source.sh",
		"upstream.json",
	])
		copyFileSync(
			join(import.meta.dir, file),
			join(directory, "scripts/fork", file),
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
 'checkout -b '*|'fetch '*|'status --porcelain '*|'check-ref-format '*|'update-ref '*|'remote add upstream '*) exit 0 ;;
 'remote get-url upstream') echo https://github.com/ParadevAI/Paradev.git ;;
 'remote get-url origin'|'remote get-url --push origin') echo https://github.com/test/fork.git ;;
 'symbolic-ref --short HEAD') echo ${HEAD} ;;
 'rev-parse --verify --quiet '*) exit 1 ;;
 'rev-parse --verify '*incoming*) echo ${SHA} ;;
 'rev-parse HEAD') if [ -f merged ]; then echo new-fork-sha; else echo original-fork-sha; fi ;;
 'merge-base --is-ancestor origin/fork/main HEAD') exit 0 ;;
 'merge-base --is-ancestor '*) if [ "$TEST_MODE" = integrated ]; then exit 0; else exit 1; fi ;;
 'rev-list --count '*) echo 2 ;;
 'merge --no-edit '*) if [ "$TEST_MODE" = conflict ]; then exit 1; else touch merged; fi ;;
 'diff --name-only --diff-filter=U') echo src/chat.ts ;;
 'merge --abort') exit 0 ;;
 'push origin '*) case "$*" in *:refs/heads/fork/main|*:refs/heads/main) exit 99;; esac ;;
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
 'api repos/ParadevAI/Paradev/releases/tags/${TAG}') echo '{"tag_name":"${TAG}","draft":false,"prerelease":false}' ;;
 'api repos/ParadevAI/Paradev/commits/${TAG} --jq .sha') echo ${SHA} ;;
 'pr list '*'--state all'*) if [ "$TEST_MODE" = existing ]; then echo https://example.test/existing-pr; fi ;;
 'pr list '*'--state closed'*) if [ "$TEST_MODE" = closed ]; then echo https://example.test/closed-pr; fi ;;
 'pr create '*) while [ "$#" -gt 0 ]; do if [ "$1" = --body-file ]; then cp "$2" "$TEST_BODY"; fi; shift; done; echo https://example.test/new-pr ;;
 *) echo "Unexpected GitHub operation: $*" >&2; exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	try {
		const result = Bun.spawnSync(
			["bash", join(import.meta.dir, "prepare-upstream-pr.sh"), TAG],
			{
				cwd: directory,
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					GITHUB_REPOSITORY: "test/fork",
					TEST_MODE: mode,
					TEST_CALLS: calls,
					TEST_BODY: join(directory, "body"),
					...env,
				},
			},
		);
		const body = join(directory, "body");
		let text = "";
		try {
			text = readFileSync(body, "utf8");
		} catch {}
		if (result.exitCode !== 0 && !mode.startsWith("fail"))
			throw new Error(
				`${result.stdout.toString()}\n${result.stderr.toString()}`,
			);
		return {
			code: result.exitCode,
			calls: readFileSync(calls, "utf8"),
			stdout: result.stdout.toString(),
			body: text,
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
		expect(result.calls).toContain(`git push origin HEAD:refs/heads/${HEAD}`);
		expect(result.calls).toContain("gh pr create");
		expect(result.calls).not.toContain("--draft");
		expect(result.calls).not.toContain("--auto");
		expect(result.body).toContain(
			`https://github.com/ParadevAI/Paradev/releases/tag/${TAG}`,
		);
		expect(result.body).toContain(SHA);
	},
);
run(
	"conflicts open a draft pointing to the official commit without updating fork/main",
	() => {
		const result = propose("conflict");
		expect(result.calls).toContain("git merge --abort");
		expect(result.calls).toContain(`git push origin ${SHA}:refs/heads/${HEAD}`);
		expect(result.calls).toContain("--draft");
		expect(result.body).toContain("src/chat.ts");
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
	"a proposal closed without merge is not reopened unless a retry is requested",
	() => {
		const closed = propose("closed");
		expect(closed.stdout).toContain("closed without merge");
		expect(closed.calls).not.toContain("git push");
		expect(closed.calls).not.toContain("gh pr create");
		const retried = propose("closed", { FORK_SYNC_RETRY: "true" });
		expect(retried.calls).toContain("gh pr create");
		expect(retried.calls).toContain(`git push origin HEAD:refs/heads/${HEAD}`);
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
run("the PR is created in the fork, never in the upstream repository", () => {
	const result = propose("clean");
	expect(result.calls).toContain("gh pr create --repo test/fork");
	expect(result.calls).not.toContain("--repo ParadevAI/Paradev");
	expect(result.calls).not.toContain("superset-sh");
});
