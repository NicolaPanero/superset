import { expect, test } from "bun:test";
import { forkRevealChatLink } from "./forkRevealChatLink";

function harness(
	locate: () => Promise<{ resolvedPath: string; isDirectory: boolean } | null>,
) {
	const calls = {
		located: [] as string[],
		revealed: [] as [string, boolean][],
		notFound: [] as string[],
		failed: 0,
	};
	const deps = {
		locate: (path: string) => {
			calls.located.push(path);
			return locate();
		},
		reveal: (path: string, options: { isDirectory: boolean }) =>
			calls.revealed.push([path, options.isDirectory]),
		notFound: (path: string) => calls.notFound.push(path),
		failed: () => {
			calls.failed++;
		},
	};
	return { calls, deps };
}

test("a bare video name is located and revealed in Finder", async () => {
	const { calls, deps } = harness(async () => ({
		resolvedPath: "/work/.tmp-demo/clips/demo.mp4",
		isDirectory: false,
	}));
	await forkRevealChatLink("demo.mp4", deps);
	expect(calls.located).toEqual(["demo.mp4"]);
	expect(calls.revealed).toEqual([["/work/.tmp-demo/clips/demo.mp4", false]]);
	expect(calls.notFound).toEqual([]);
});

test("the line position of a reference does not reach the locator or Finder", async () => {
	const { calls, deps } = harness(async () => ({
		resolvedPath: "/work/src/app.ts",
		isDirectory: false,
	}));
	await forkRevealChatLink("src/app.ts:12:3", deps);
	expect(calls.located).toEqual(["src/app.ts"]);
	expect(calls.revealed).toEqual([["/work/src/app.ts", false]]);
});

test("a folder is revealed as a folder", async () => {
	const { calls, deps } = harness(async () => ({
		resolvedPath: "/work/out",
		isDirectory: true,
	}));
	await forkRevealChatLink("out", deps);
	expect(calls.revealed).toEqual([["/work/out", true]]);
});

test("a path that exists nowhere says so and reveals nothing", async () => {
	const { calls, deps } = harness(async () => null);
	await forkRevealChatLink("missing.mp4", deps);
	expect(calls.notFound).toEqual(["missing.mp4"]);
	expect(calls.revealed).toEqual([]);
});

test("a host that cannot answer is reported, not thrown", async () => {
	const { calls, deps } = harness(async () => {
		throw new Error("offline");
	});
	await expect(forkRevealChatLink("demo.mp4", deps)).resolves.toBeUndefined();
	expect(calls.failed).toBe(1);
	expect(calls.revealed).toEqual([]);
});

test("a link that is not a file is ignored", async () => {
	const { calls, deps } = harness(async () => null);
	await forkRevealChatLink("https://example.com/demo.mp4", deps);
	await forkRevealChatLink("mailto:a@example.com", deps);
	expect(calls.located).toEqual([]);
	expect(calls.notFound).toEqual([]);
});
