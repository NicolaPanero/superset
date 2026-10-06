import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChangesOpenTarget = "pane" | "tab";

interface Settings {
	acpChatEnabled: boolean;
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
	expandUnchanged: boolean;
	/** How the top-bar Changes button (and ⌘⇧L) opens the Changes surface:
	 * split the current tab, or focus/create a dedicated tab. */
	changesOpenTarget: ChangesOpenTarget;
}

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

/**
 * The chat became the default surface; the old default was saved as an
 * explicit `false`, so it is turned on once and then left alone.
 */
export function migrateSettings(persisted: unknown, version: number): unknown {
	return version < 1 && persisted && typeof persisted === "object"
		? { ...persisted, acpChatEnabled: true }
		: persisted;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			acpChatEnabled: true,
			diffStyle: "split",
			showDiffComments: true,
			expandUnchanged: false,
			changesOpenTarget: "pane",
			update: (key, value) => set({ [key]: value }),
		}),
		{
			name: "settings",
			version: 1,
			migrate: migrateSettings,
		},
	),
);
