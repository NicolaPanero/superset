import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readOutputTail } from "./fork-background-output";

const dir = mkdtempSync(join(tmpdir(), "fork-task-output-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("a task's output shows its latest lines and says when earlier output is cut", async () => {
	const path = join(dir, "task.output");
	writeFileSync(path, `${"x".repeat(100)}\nserver ready on :41105\n`);
	expect(await readOutputTail(path)).toEqual({
		text: `${"x".repeat(100)}\nserver ready on :41105\n`,
		truncated: false,
	});
	expect(await readOutputTail(path, 23)).toEqual({
		text: "server ready on :41105\n",
		truncated: true,
	});
	expect(await readOutputTail(dir)).toBeNull();
});
