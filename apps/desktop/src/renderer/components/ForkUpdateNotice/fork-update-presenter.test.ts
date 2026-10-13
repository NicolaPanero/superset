import { expect, mock, test } from "bun:test";
import { createForkUpdateCheck } from "../../../main/lib/fork-update-check";
import { createForkUpdateNotices } from "../../../main/lib/fork-update-notices";
import { createForkUpdatePresenter } from "./fork-update-presenter";

const a = {
	tag: "desktop-v1.37.0-fork.aaaaaaa",
	installed: "desktop-v1.37.0-fork.old",
};
const b = { ...a, tag: "desktop-v1.37.0-fork.bbbbbbb" };
test("a background discovery waits for focus and does not repeat on subsequent focus events", () => {
	let focused = false;
	const show = mock(() => {}),
		hide = mock(() => {});
	const p = createForkUpdatePresenter({ focused: () => focused, show, hide });
	p.update(a);
	expect(show).not.toHaveBeenCalled();
	focused = true;
	p.foreground();
	p.foreground();
	p.update(a);
	expect(show).toHaveBeenCalledTimes(1);
	p.update(null);
	expect(hide).toHaveBeenCalled();
	p.update(b);
	expect(show).toHaveBeenLastCalledWith(b);
	p.dispose();
	expect(hide).toHaveBeenCalledTimes(4);
});
test("automatic check, renderer delivery, Later and the next release form a complete notice lifecycle", async () => {
	const notices = createForkUpdateNotices();
	const show = mock(() => {}),
		hide = mock(() => {}),
		nativeOffer = mock(async () => true);
	const presenter = createForkUpdatePresenter({
		focused: () => true,
		show,
		hide,
	});
	notices.subscribe(presenter.update);
	let tag = a.tag;
	const check = createForkUpdateCheck({
		installed: a.installed,
		latestRelease: async () => tag,
		offer: async (latest, interactive) => {
			if (interactive) {
				notices.dismiss(latest);
				return nativeOffer();
			}
			notices.publish({ tag: latest, installed: a.installed });
			return true;
		},
		upToDate: async () => {},
		failed: async () => {},
	});
	await check();
	expect(show).toHaveBeenLastCalledWith(a);
	expect(nativeOffer).not.toHaveBeenCalled();
	notices.dismiss(a.tag);
	await check();
	expect(show).toHaveBeenCalledTimes(1);
	tag = b.tag;
	await check();
	expect(show).toHaveBeenLastCalledWith(b);
	await check(true);
	expect(nativeOffer).toHaveBeenCalledTimes(1);
});
