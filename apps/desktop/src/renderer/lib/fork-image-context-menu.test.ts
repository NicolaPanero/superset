import { afterEach, expect, test } from "bun:test";
import { installForkImageContextMenu } from "./fork-image-context-menu";

function image(size: number, naturalWidth = size) {
	const img = document.createElement("img");
	Object.defineProperty(img, "naturalWidth", { value: naturalWidth });
	img.getBoundingClientRect = () => ({ width: size, height: size }) as DOMRect;
	return img;
}

function reachesPage(target: HTMLElement) {
	let reached = false;
	const onContextMenu = () => {
		reached = true;
	};
	document.body.addEventListener("contextmenu", onContextMenu);
	target.dispatchEvent(
		new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
	);
	document.body.removeEventListener("contextmenu", onContextMenu);
	return reached;
}

let uninstall = () => {};
afterEach(() => {
	uninstall();
	document.body.replaceChildren();
});

test("a loaded image skips page menus so the native image menu opens", () => {
	uninstall = installForkImageContextMenu(window);
	const shown = image(160);
	const icon = image(16);
	const pending = image(160, 0);
	const editor = document.createElement("div");
	editor.setAttribute("contenteditable", "true");
	const inline = image(160);
	editor.append(inline);
	document.body.append(shown, icon, pending, editor);

	expect(reachesPage(shown)).toBe(false);
	expect(reachesPage(icon)).toBe(true);
	expect(reachesPage(pending)).toBe(true);
	expect(reachesPage(inline)).toBe(true);
});
