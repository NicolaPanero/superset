import { expect, mock, test } from "bun:test";
import { createForkUpdateNotices } from "./fork-update-notices";

const a = {
	tag: "desktop-v1.37.0-fork.aaaaaaa",
	installed: "desktop-v1.37.0-fork.old",
};
const b = { ...a, tag: "desktop-v1.37.0-fork.bbbbbbb" };
test("a renderer mounted after discovery receives the available release", () => {
	const store = createForkUpdateNotices();
	store.publish(a);
	const listener = mock(() => {});
	const stop = store.subscribe(listener);
	expect(listener).toHaveBeenLastCalledWith(a);
	stop();
	store.publish(b);
	expect(listener).toHaveBeenCalledTimes(1);
});
test("Later clears that release in every window, but does not hide a newer release", () => {
	const store = createForkUpdateNotices();
	const one = mock(() => {}),
		two = mock(() => {});
	store.subscribe(one);
	store.subscribe(two);
	store.publish(a);
	store.dismiss(a.tag);
	expect(one).toHaveBeenLastCalledWith(null);
	expect(two).toHaveBeenLastCalledWith(null);
	store.publish(b);
	store.dismiss(a.tag);
	expect(store.get()).toEqual(b);
	expect(one).toHaveBeenLastCalledWith(b);
	expect(two).toHaveBeenLastCalledWith(b);
});
