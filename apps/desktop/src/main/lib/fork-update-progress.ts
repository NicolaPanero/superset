import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { BrowserWindow, nativeTheme } from "electron";

const escapeHtml = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				char
			] ?? char,
	);
export async function showForkUpdateProgress(cancel: () => void) {
	const parent = BrowserWindow.getFocusedWindow() ?? undefined;
	const dark = nativeTheme.shouldUseDarkColors;
	const window = new BrowserWindow({
		width: 440,
		height: 190,
		show: false,
		resizable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		title: "Superset++",
		...(parent ? { parent, modal: true } : {}),
		backgroundColor: dark ? "#1d1c1b" : "#ffffff",
		webPreferences: {
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	window.once("closed", cancel);
	try {
		await window.loadURL(
			`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:24px;font:14px -apple-system,BlinkMacSystemFont,sans-serif;color:${dark ? "#eceae8" : "#222"}}h1{font-size:17px;margin:0 0 12px}.spinner{display:inline-block;width:14px;height:14px;border:2px solid #888;border-top-color:currentColor;border-radius:50%;animation:spin 1s linear infinite;margin-right:10px;vertical-align:middle}@keyframes spin{to{transform:rotate(360deg)}}p{line-height:1.5;margin:0;opacity:.8}</style></head><body><h1 role="status"><span class="spinner"></span>${escapeHtml(i18n._(msg({ message: "Updating…" })))}</h1><p>${escapeHtml(i18n._(msg({ message: "The app will restart when the update is ready. Settings and data are kept." })))}</p></body></html>`)}`,
		);
		window.show();
		return {
			close() {
				window.removeListener("closed", cancel);
				if (!window.isDestroyed()) window.destroy();
			},
		};
	} catch (error) {
		window.removeListener("closed", cancel);
		window.destroy();
		throw error;
	}
}
