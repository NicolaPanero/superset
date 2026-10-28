import { expect, test } from "bun:test";
import { createQuotaRefresh } from "./fork-quota-refresh";

function fixture() {
	let clock = 0;
	const reads: boolean[] = [];
	let expired = 0;
	type FakeTimer = {
		run: () => void;
		at: number;
		every?: number;
		unref?: () => void;
	};
	const timers: FakeTimer[] = [];
	const refresh = createQuotaRefresh({
		read: async (force) => {
			reads.push(force);
		},
		expire: () => {
			expired++;
		},
		now: () => clock,
		after: (run, ms) => {
			const timer: FakeTimer = { run, at: clock + ms };
			timers.push(timer);
			return timer;
		},
		cancel: (timer) => {
			timers.splice(timers.indexOf(timer as never), 1);
		},
		every: (run, ms) => {
			const timer: FakeTimer = { run, at: clock + ms, every: ms };
			timers.push(timer);
			return timer;
		},
		stopEvery: (timer) => {
			timers.splice(timers.indexOf(timer as never), 1);
		},
	});
	const advance = (ms: number) => {
		clock += ms;
		for (const timer of [...timers].filter((t) => t.at <= clock)) {
			if (timer.every) timer.at += timer.every;
			else timers.splice(timers.indexOf(timer), 1);
			timer.run();
		}
	};
	return { refresh, reads, advance, expired: () => expired, timers };
}

test("the host reads usage every minute without a window asking", () => {
	const f = fixture();
	const stop = f.refresh.start();
	f.advance(60_000);
	f.advance(60_000);
	expect(f.reads).toEqual([false, false]);
	stop();
	f.advance(60_000);
	expect(f.reads).toEqual([false, false]);
});

test("a finished turn forces a fresh read a few seconds later, at most once a minute", () => {
	const f = fixture();
	f.refresh.afterTurn();
	f.refresh.afterTurn();
	f.advance(5_000);
	expect(f.reads).toEqual([true]);
	expect(f.expired()).toBe(1);
	f.refresh.afterTurn();
	f.advance(5_000);
	expect(f.reads).toEqual([true]);
	f.advance(55_000);
	expect(f.reads).toEqual([true, true]);
	expect(f.expired()).toBe(2);
});
