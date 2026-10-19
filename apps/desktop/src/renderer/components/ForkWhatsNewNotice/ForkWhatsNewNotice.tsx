import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useState } from "react";
import { NoticeDialog } from "renderer/components/DesktopNotices/components/NoticeDialog";

export const FORK_WHATS_NEW_ID = "provider-integrations-2026-10";
export const FORK_WHATS_NEW_STORAGE_KEY = "superset-fork-whats-new";

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

const notice: DesktopNotice = {
	id: `fork-whats-new:${FORK_WHATS_NEW_ID}`,
	severity: "info",
	trigger: "post-update",
	body: `### Novità in Superset++

- **Jira e Bitbucket nell’app** — attività, board, pull request, review, build e automazioni.
- **Cambio agente più completo** — scegli modello ed effort prima dello switch, incluso Grok 4.6 e 4.5.
- **Quote sotto controllo** — utilizzo per account, reset gratuiti supportati e continuazione automatica.
- **Flussi più sicuri** — account separati per repository e protezioni aggiuntive per branch e richieste concorrenti.

Questa finestra ricomparirà solo quando ci saranno nuove funzioni importanti.`,
	cta: {
		label: "Apri la guida",
		action: "open-url",
		url: "https://github.com/NicolaPanero/superset/blob/fork/main/FORK.md",
	},
	dismissible: true,
};

/**
 * One fixed-size localStorage value. Dismissing replaces the previous release
 * note id; removing this feature must move the key to DEAD_KEYS.
 */
export function ForkWhatsNewNotice() {
	const [seen, setSeen] = useState(() => hasSeenForkWhatsNew(localStorage));
	if (seen) return null;
	const dismiss = () => {
		markForkWhatsNewSeen(localStorage);
		setSeen(true);
	};
	return <NoticeDialog notice={notice} onDismiss={dismiss} />;
}
