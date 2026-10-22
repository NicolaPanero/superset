import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Step = {
	name?: string;
	run?: string;
	id?: string;
	if?: string;
	with?: { key?: string };
};
type Workflow = {
	on: Record<string, unknown>;
	concurrency: { "cancel-in-progress": boolean };
	jobs: Record<string, { needs?: string[]; steps: Step[] }>;
};
const root = resolve(import.meta.dir, "../..");
const workflow = Bun.YAML.parse(
	readFileSync(join(root, ".github/workflows/fork-release.yml"), "utf8"),
) as Workflow;
function runStep(job: string, name: string, env: Record<string, string>) {
	const script = workflow.jobs[job]?.steps.find(
		(step) => step.name === name,
	)?.run;
	if (!script) throw new Error(`Missing workflow step: ${name}`);
	const directory = mkdtempSync(join(tmpdir(), "fork-release-workflow-"));
	const output = join(directory, "output");
	writeFileSync(output, "");
	writeFileSync(
		join(directory, "gh"),
		`#!/bin/bash
case "$*" in
 *commits/fork/main*) printf '%s\\n' "$TEST_HEAD" ;;
 *contents/apps/desktop/package.json*) printf '%s\\n' 'eyJ2ZXJzaW9uIjoiMS4zOC4wIn0=' ;;
 *contents/scripts/fork/txcript-version.json*) printf '%s\\n' 'eyJ0YWciOiJ2MC4xNC40LWZvcmsuMTUifQ==' ;;
 'release view '*) exit 1 ;;
 *) echo 'Unexpected GitHub mutation' >&2; exit 99 ;;
esac
`,
		{ mode: 0o700 },
	);
	try {
		const result = Bun.spawnSync(
			["bash", "-e", "-o", "pipefail", "-c", script],
			{
				cwd: directory,
				env: {
					...process.env,
					PATH: `${directory}:/usr/bin:/bin`,
					GITHUB_OUTPUT: output,
					GITHUB_REPOSITORY: "test/fork",
					FORCE: "false",
					...env,
				},
			},
		);
		return {
			code: result.exitCode,
			output: readFileSync(output, "utf8"),
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
test("a superseded push skips platform builds, while the latest push remains eligible", () => {
	const stale = runStep("check", "Find the commit to build", {
		TEST_HEAD: "abcdef0123456789",
		EVENT_SHA: "1111111111111111",
	});
	expect(stale.code).toBe(0);
	expect(stale.output).toContain("build=false");
	const current = runStep("check", "Find the commit to build", {
		TEST_HEAD: "abcdef0123456789",
		EVENT_SHA: "abcdef0123456789",
	});
	expect(current.code).toBe(0);
	expect(current.output).toContain("build=true");
});
test("a completed build cannot publish after fork/main moves forward", () => {
	const result = runStep("publish", "Publish the verified build", {
		TEST_HEAD: "abcdef0123456789",
		SHA: "1111111111111111",
	});
	expect(result.code).toBe(0);
	expect(result.stdout).toContain("Skipping outdated release");
	expect(result.stderr).not.toContain("Unexpected GitHub mutation");
});
test("push and manual dispatch share latest-only cancellation, without a second sync completion trigger", () => {
	expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
	expect(workflow.on.workflow_run).toBeUndefined();
	expect(workflow.on.push).toBeDefined();
	expect(workflow.on.workflow_dispatch).toBeDefined();
	expect(workflow.jobs.publish?.needs).toEqual(["check", "build"]);
});

test("only the platform build restores packages, with exact commit and helper keys", () => {
	const cache = workflow.jobs.build?.steps.find(
		(step) => step.id === "package-cache",
	);
	expect(cache?.with?.key).toContain("needs.check.outputs.sha");
	expect(cache?.with?.key).toContain("needs.check.outputs.txcript_tag");
	for (const name of [
		"Compile app and bundle transfer tools",
		"Package macOS",
	]) {
		expect(
			workflow.jobs.build?.steps.find((step) => step.name === name)?.if,
		).toContain("steps.package-cache.outputs.cache-hit != 'true'");
	}
	expect(
		workflow.jobs.validate?.steps.some((step) =>
			step.if?.includes("package-cache"),
		),
	).toBe(false);
});

test("release skips general checks only after cached or matching PR validation", () => {
	const steps = workflow.jobs.validate?.steps ?? [];
	for (const step of steps.filter((step) =>
		step.run?.includes("validate.sh"),
	)) {
		expect(step.if).toContain(
			"steps.validation-cache.outputs.cache-hit != 'true'",
		);
		expect(step.if).toContain(
			"steps.pr-validation.outputs.validated != 'true'",
		);
	}
	expect(steps.find((step) => step.id === "pr-validation")?.run).toBe(
		"bash scripts/fork/reuse-pr-validation.sh",
	);
	const regression = Bun.YAML.parse(
		readFileSync(join(root, ".github/workflows/fork-tests.yml"), "utf8"),
	) as Workflow;
	const prSteps = regression.jobs.regression?.steps ?? [];
	const validate = prSteps.findIndex((step) =>
		step.run?.includes("validate.sh"),
	);
	const record = prSteps.findIndex((step) => step.id === "tested-tree");
	expect(validate).toBeGreaterThanOrEqual(0);
	expect(record).toBeGreaterThan(validate);
	expect(prSteps[record]?.run).toContain("HEAD^{tree}");
});
