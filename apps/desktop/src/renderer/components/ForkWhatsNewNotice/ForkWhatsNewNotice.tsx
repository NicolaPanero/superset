import { useLingui } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useState } from "react";
import { NoticeDialog } from "renderer/components/DesktopNotices/components/NoticeDialog";

export const FORK_WHATS_NEW_ID = "jira-today-layout-2026-10";
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
				"Jira automations are now tracked until the end: a queue, a limit on agents at the same time, retries, a preview and a manual run.",
		}),
		t({
			message:
				"New local triggers: pull request comments, failed checks and a schedule, with ready-made templates.",
		}),
		t({
			message:
				"Log time on a Jira issue from its details, with your time of today and the issue history.",
		}),
		t({
			message:
				"Today puts tasks without worklogs first, with 7, 30 and 90 day filters and a layout that adapts to your window.",
		}),
		t({
			message:
				"Pages is hidden with the other cloud features, and the hidden cloud features no longer make requests.",
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
