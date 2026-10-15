import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "reuse-pr-validation.sh");
const tree = "1234567890abcdef";
const passedRun = {
	workflow_id: 42,
	status: "completed",
	conclusion: "success",
	event: "pull_request",
	head_repository: { full_name: "test/fork" },
};

function reuse({
	testedTree = tree,
	expired = false,
	run = passedRun,
	unavailable = false,
} = {}) {
	const directory = mkdtempSync(join(tmpdir(), "fork-pr-validation-"));
	const output = join(directory, "output");
	writeFileSync(output, "");
	writeFileSync(join(directory, "run.json"), JSON.stringify(run));
	writeFileSync(
		join(directory, "gh"),
		`#!/bin/bash
set -euo pipefail
if [ "$TEST_UNAVAILABLE" = true ]; then exit 1; fi
case "$2" in
  */actions/workflows/fork-tests.yml) echo 42 ;;
  */actions/"artifacts?name=fork-validated-tree-v1-$TEST_TREE&per_page=100")
    if [ "$TEST_EXPIRED" != true ]; then echo 99; fi ;;
  */actions/artifacts*) : ;;
  */actions/runs/99) jq -r "\${!#}" "$TEST_RUN" ;;
  *) exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	writeFileSync(
		join(directory, "git"),
		`#!/bin/bash
test "$*" = 'rev-parse HEAD^{tree}' || exit 99
echo '${tree}'
`,
		{ mode: 0o700 },
	);
	try {
		const result = Bun.spawnSync(["bash", script], {
			cwd: directory,
			env: {
				...process.env,
				PATH: `${directory}:/usr/bin:/bin`,
				GITHUB_OUTPUT: output,
				GITHUB_REPOSITORY: "test/fork",
				TEST_TREE: testedTree,
				TEST_EXPIRED: String(expired),
				TEST_UNAVAILABLE: String(unavailable),
				TEST_RUN: join(directory, "run.json"),
			},
		});
		return { code: result.exitCode, output: readFileSync(output, "utf8") };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test.skipIf(process.platform === "win32")(
	"a passed PR with identical content is reused even when the merge commit changes",
	() => {
		expect(reuse()).toEqual({ code: 0, output: "validated=true\n" });
	},
);

test.skipIf(process.platform === "win32")(
	"missing, expired or untrusted validation falls back to running release checks",
	() => {
		const fallback = { code: 0, output: "validated=false\n" };
		expect(reuse({ testedTree: "different-content" })).toEqual(fallback);
		expect(reuse({ expired: true })).toEqual(fallback);
		expect(reuse({ unavailable: true })).toEqual(fallback);
		for (const run of [
			{ ...passedRun, conclusion: "failure" },
			{ ...passedRun, status: "in_progress" },
			{ ...passedRun, workflow_id: 43 },
			{ ...passedRun, event: "push" },
			{ ...passedRun, head_repository: { full_name: "other/fork" } },
		])
			expect(reuse({ run })).toEqual(fallback);
	},
);
