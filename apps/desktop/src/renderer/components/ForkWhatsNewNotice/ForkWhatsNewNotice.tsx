import { useLingui } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useState } from "react";
import { NoticeDialog } from "renderer/components/DesktopNotices/components/NoticeDialog";

export const FORK_WHATS_NEW_ID = "paradev-2.0-migration-2026-10";
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
			message: "Superset++ is now Paradev++, with the same logo and your data.",
		}),
		t({
			message:
				"The new workspace layout keeps your account, model and repository controls.",
		}),
		t({
			message: "Open chat history directly from the composer.",
		}),
		t({
			message:
				"Stop a busy Claude chat and switch accounts while keeping its history.",
		}),
		t({
			message: "Existing accounts, settings and update channels are preserved.",
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
