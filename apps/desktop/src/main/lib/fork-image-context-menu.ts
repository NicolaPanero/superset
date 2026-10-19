import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { clipboard, Menu } from "electron";

export function attachForkImageContextMenu(wc: Electron.WebContents): void {
	wc.on("context-menu", (_event, params) => {
		if (params.mediaType !== "image" || params.isEditable) return;

		const menuItems: Electron.MenuItemConstructorOptions[] = [
			{
				label: i18n._(msg({ message: "Copy image" })),
				click: () => wc.copyImageAt(params.x, params.y),
			},
		];
		if (/^https?:/.test(params.srcURL)) {
			menuItems.push({
				label: i18n._(msg({ message: "Copy URL" })),
				click: () => clipboard.writeText(params.srcURL),
			});
		}

		Menu.buildFromTemplate(menuItems).popup();
	});
}
