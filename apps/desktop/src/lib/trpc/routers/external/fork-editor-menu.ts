import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	EXTERNAL_APPS,
	type ExternalApp,
	NON_EDITOR_APPS,
} from "@superset/local-db";
import { BrowserWindow, Menu } from "electron";
import { getAppCommand } from "./helpers";

const labels: Partial<Record<ExternalApp, string>> = {
	zed: "Zed",
	intellij: "IntelliJ IDEA",
	pycharm: "PyCharm",
};
let pending: Promise<ExternalApp | null> | undefined;

export function chooseForkEditor(): Promise<ExternalApp | null> {
	if (pending) return pending;
	const choice = new Promise<ExternalApp | null>((resolve) => {
		const items: Electron.MenuItemConstructorOptions[] = [
			{
				label: i18n._(msg({ message: "Open in editor" })),
				enabled: false,
			},
			{ type: "separator" },
		];
		for (const editor of EXTERNAL_APPS) {
			if (NON_EDITOR_APPS.includes(editor) || !getAppCommand(editor, ""))
				continue;
			const macCommand = getAppCommand(editor, "", "darwin")?.[0];
			const appName = macCommand?.args.find(
				(_arg, index) => index > 0 && macCommand.args[index - 1] === "-a",
			);
			items.push({
				label: labels[editor] ?? appName ?? editor,
				click: () => resolve(editor),
			});
		}
		items.push(
			{ type: "separator" },
			{
				label: i18n._(msg({ message: "Cancel" })),
				click: () => resolve(null),
			},
		);
		Menu.buildFromTemplate(items).popup({
			window: BrowserWindow.getFocusedWindow() ?? undefined,
			callback: () => resolve(null),
		});
	});
	pending = choice.finally(() => {
		pending = undefined;
	});
	return pending;
}
