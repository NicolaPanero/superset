import { expect, test } from "bun:test";
import { createExternalSessionsCache } from "./fork-external-sessions-cache";

test("shares a scan, reuses a recent full scan for a quick list, and refreshes on request", async () => {
	let time = 0;
	let loads = 0;
	const cache = createExternalSessionsCache<string>(() => time);
	const load = (value: string) => () => {
		loads++;
		return Promise.resolve(value);
	};
	const [a, b] = await Promise.all([
		cache("/p", true, false, load("full")),
		cache("/p", true, false, load("full")),
	]);
	expect([a, b, loads]).toEqual(["full", "full", 1]);
	expect(await cache("/p", false, false, load("quick"))).toBe("full");
	expect(loads).toBe(1);
	expect(await cache("/p", true, true, load("new"))).toBe("new");
	time = 30_000;
	expect(await cache("/p", false, false, load("quick"))).toBe("quick");
	expect(loads).toBe(3);
});

test("a failed scan is not kept", async () => {
	const cache = createExternalSessionsCache<string>(() => 0);
	await expect(
		cache("/p", true, false, () => Promise.reject(new Error("x"))),
	).rejects.toThrow("x");
	await Bun.sleep(0);
	expect(await cache("/p", true, false, () => Promise.resolve("ok"))).toBe(
		"ok",
	);
});
