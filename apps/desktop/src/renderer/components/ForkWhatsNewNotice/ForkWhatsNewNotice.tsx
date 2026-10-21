import { useLingui } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useState } from "react";
import { NoticeDialog } from "renderer/components/DesktopNotices/components/NoticeDialog";

export const FORK_WHATS_NEW_ID = "chat-plans-controls-2026-10";
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
				"**Jira automations**: ACP chats with account and model selection.",
		}),
		t({
			message:
				"**Visual filters**: configure Jira automations with filters or JQL.",
		}),
		t({
			message:
				"**Workspace creation**: microphone before Create & start, paid task links hidden with paid features.",
		}),
		t({
			message:
				"**Chats and plans**: New Chat naming, plan previews and a side panel, plus clearer restart and branch controls.",
		}),
		t({
			message:
				"**Clearer meters**: separate 5-hour and weekly quota rings, with an always-visible context control for every agent.",
		}),
	];
	const notice: DesktopNotice = {
		id: `fork-whats-new:${FORK_WHATS_NEW_ID}`,
		severity: "info",
		trigger: "post-update",
		body: [
			`### ${t({ message: "What's new in Superset++" })}`,
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
