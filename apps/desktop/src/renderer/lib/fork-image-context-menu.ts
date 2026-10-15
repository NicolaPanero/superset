const MIN_IMAGE_SIZE = 48;

export function usesNativeImageMenu(
	target: EventTarget | null,
): target is HTMLImageElement {
	if (!(target instanceof HTMLImageElement)) return false;
	if (target.naturalWidth === 0) return false;
	if (target.closest("[contenteditable='true']")) return false;
	const { width, height } = target.getBoundingClientRect();
	return width >= MIN_IMAGE_SIZE && height >= MIN_IMAGE_SIZE;
}

// Pane-level Radix context menus call preventDefault, which stops Electron
// from emitting its own context-menu event. Keeping the event from reaching
// React lets the main process show the native image menu.
export function installForkImageContextMenu(target: Window = window) {
	const onContextMenu = (event: MouseEvent) => {
		if (usesNativeImageMenu(event.target)) event.stopPropagation();
	};
	target.addEventListener("contextmenu", onContextMenu, { capture: true });
	return () =>
		target.removeEventListener("contextmenu", onContextMenu, { capture: true });
}
