import { useLingui } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useState } from "react";
import { NoticeDialog } from "renderer/components/DesktopNotices/components/NoticeDialog";

export const FORK_WHATS_NEW_ID = "keep-awake-2026-10";
export const FORK_WHATS_NEW_STORAGE_KEY = "superset-fork-whats-new";
const FORK_GUIDE_URL =
	"https://github.com/NicolaPanero/superset/blob/fork/main/FORK.md";

interface ForkWhatsNewStorage {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
}

export function hasSeenForkWhatsNew(storage: ForkWhatsNewStorage): boolean {
	return storage.getItem(FORK_WHATS_NEW_STORAGE_KEY) === FORK_WHATS_NEW_ID;
}

export function markForkWhatsNewSeen(storage: ForkWhatsNewStorage): void {
	storage.setItem(FORK_WHATS_NEW_STORAGE_KEY, FORK_WHATS_NEW_ID);
}

/**
 * One fixed-size localStorage value. Dismissing replaces the previous release
 * note id; removing this feature must move the key to DEAD_KEYS.
 */
export function ForkWhatsNewNotice() {
	const { t } = useLingui();
	const [seen, setSeen] = useState(() => hasSeenForkWhatsNew(localStorage));
	if (seen) return null;
	const highlights = [
		t({
			message:
				"Paradev++ keeps the Mac awake while your agents work, so a long task does not stop when the Mac goes idle.",
		}),
		t({
			message:
				"Choose Never, While Agents Work or Always from the Paradev++ icon in the menu bar.",
		}),
		t({
			message: "Closing the lid still puts the Mac to sleep.",
		}),
		t({
			message:
				"In a Claude chat, pick another account in the composer to move the chat there at once, with its full history.",
		}),
		t({
			message:
				"The app is now Paradev++.app. The update moves Superset++.app to the Trash, so pin the new app in the Dock again.",
		}),
	];
	const notice: DesktopNotice = {
		id: `fork-whats-new:${FORK_WHATS_NEW_ID}`,
		severity: "info",
		trigger: "post-update",
		body: [
			`### ${t({ message: "What's new in Paradev++" })}`,
			highlights.map((line) => `- ${line}`).join("\n"),
			t({
				message:
					"This window shows again only when there are new important features.",
			}),
		].join("\n\n"),
		cta: {
			label: t({ message: "Open the guide" }),
			action: "open-url",
			url: FORK_GUIDE_URL,
		},
		dismissible: true,
	};
	const dismiss = () => {
		markForkWhatsNewSeen(localStorage);
		setSeen(true);
	};
	return <NoticeDialog notice={notice} onDismiss={dismiss} />;
}
