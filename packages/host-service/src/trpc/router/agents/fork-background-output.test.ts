import { afterAll, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
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

test("output reads stay in trusted roots and reject file or parent links", async () => {
	const allowed = join(dir, "allowed");
	const outside = join(dir, "outside");
	mkdirSync(allowed);
	mkdirSync(outside);
	writeFileSync(join(outside, "secret"), "private credentials");
	writeFileSync(join(allowed, "task.output"), "ready");
	expect(
		await readOutputTail(join(outside, "secret"), 100, [allowed]),
	).toBeNull();
	expect(
		await readOutputTail(join(allowed, "..", "outside", "secret"), 100, [
			allowed,
		]),
	).toBeNull();
	expect(await readOutputTail("task.output", 100, [allowed])).toBeNull();
	symlinkSync(
		outside,
		join(allowed, "redirect"),
		process.platform === "win32" ? "junction" : "dir",
	);
	expect(
		await readOutputTail(join(allowed, "redirect", "secret"), 100, [allowed]),
	).toBeNull();
	if (process.platform !== "win32") {
		symlinkSync(join(outside, "secret"), join(allowed, "link.output"));
		expect(
			await readOutputTail(join(allowed, "link.output"), 100, [allowed]),
		).toBeNull();
	}
	expect(
		await readOutputTail(join(allowed, "task.output"), 100, [allowed]),
	).toEqual({ text: "ready", truncated: false });
});

test("a trusted root may itself have a canonical filesystem alias", async () => {
	const real = join(dir, "session-output");
	const alias = join(dir, "session-alias");
	mkdirSync(real);
	writeFileSync(join(real, "task.output"), "live");
	symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");
	expect(
		await readOutputTail(join(alias, "task.output"), 100, [alias]),
	).toEqual({ text: "live", truncated: false });
	expect(
		await readOutputTail(realpathSync(join(real, "task.output")), 100, [
			join(dir, "missing-root"),
			alias,
		]),
	).toEqual({ text: "live", truncated: false });
});
