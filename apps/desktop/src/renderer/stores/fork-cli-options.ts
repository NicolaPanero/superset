import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ForkCliOptions {
	showCliOptions: boolean;
	setShowCliOptions: (enabled: boolean) => void;
}
export const useForkCliOptionsStore = create<ForkCliOptions>()(
	persist(
		(set) => ({
			showCliOptions: false,
			setShowCliOptions: (enabled) => set({ showCliOptions: enabled }),
		}),
		{
			name: "superset-fork-cli-options",
			partialize: ({ showCliOptions }) => ({ showCliOptions }),
			merge: (saved, current) => ({
				...current,
				showCliOptions:
					!!saved &&
					typeof saved === "object" &&
					"showCliOptions" in saved &&
					saved.showCliOptions === true,
			}),
		},
	),
);
export const useForkCliOptions = () =>
	useForkCliOptionsStore((state) => state.showCliOptions);
