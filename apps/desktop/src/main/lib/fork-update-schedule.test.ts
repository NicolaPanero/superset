import { expect, mock, test } from "bun:test";
import { scheduleForkUpdateChecks } from "./fork-update-schedule";

function fixture() {
	let clock = 0;
	const callbacks = new Map<string, () => void>();
	const delays = new Map<string, number>();
	const disposed: string[] = [];
	const register = (name: string, callback: () => void, delay?: number) => {
		callbacks.set(name, callback);
		if (delay !== undefined) delays.set(name, delay);
		return () => {
			disposed.push(name);
			callbacks.delete(name);
		};
	};
	const check = mock(() => {});
	const dispose = scheduleForkUpdateChecks({
		check,
		now: () => clock,
		after: (fn, delay) => register("first", fn, delay),
		every: (fn, delay) => register("periodic", fn, delay),
		onFocus: (fn) => register("focus", fn),
		onResume: (fn) => register("resume", fn),
	});
	return {
		check,
		delays,
		disposed,
		dispose,
		at: (time: number) => {
			clock = time;
		},
		event: (name: string) => callbacks.get(name)?.(),
	};
}
test("checks one minute after startup and every fifteen minutes", () => {
	const f = fixture();
	expect(f.delays.get("first")).toBe(60_000);
	expect(f.delays.get("periodic")).toBe(900_000);
	expect(f.check).not.toHaveBeenCalled();
	f.at(60_000);
	f.event("first");
	f.at(900_000);
	f.event("periodic");
	expect(f.check).toHaveBeenCalledTimes(2);
});
test("returning to the app or waking checks promptly without a rapid focus loop", () => {
	const f = fixture();
	f.event("focus");
	expect(f.check).not.toHaveBeenCalled();
	f.at(120_000);
	f.event("focus");
	f.at(120_001);
	f.event("focus");
	f.event("resume");
	expect(f.check).toHaveBeenCalledTimes(1);
	f.at(600_000);
	f.event("resume");
	expect(f.check).toHaveBeenCalledTimes(2);
});
test("cleanup removes timers and application listeners", () => {
	const f = fixture();
	f.dispose();
	expect(f.disposed).toEqual(["first", "periodic", "focus", "resume"]);
	f.event("focus");
	f.event("periodic");
	expect(f.check).not.toHaveBeenCalled();
});
