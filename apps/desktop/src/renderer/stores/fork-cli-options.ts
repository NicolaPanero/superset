import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ForkCliOptions {
	hideCliOptions: boolean;
	hideProFeatures: boolean;
	showCliOptions: boolean;
	setHideCliOptions: (enabled: boolean) => void;
	setHideProFeatures: (enabled: boolean) => void;
	setShowCliOptions: (enabled: boolean) => void;
}
export const useForkCliOptionsStore = create<ForkCliOptions>()(
	persist(
		(set) => ({
			hideCliOptions: true,
			hideProFeatures: true,
			showCliOptions: false,
			setHideCliOptions: (enabled) =>
				set({ hideCliOptions: enabled, showCliOptions: !enabled }),
			setHideProFeatures: (enabled) => set({ hideProFeatures: enabled }),
			setShowCliOptions: (enabled) =>
				set({ showCliOptions: enabled, hideCliOptions: !enabled }),
		}),
		{
			name: "superset-fork-cli-options",
			version: 1,
			migrate: (saved) => saved,
			partialize: ({ hideCliOptions, hideProFeatures }) => ({
				hideCliOptions,
				hideProFeatures,
			}),
			merge: (saved, current) => {
				const flags = saved && typeof saved === "object" ? saved : {};
				const hideCliOptions =
					"hideCliOptions" in flags && typeof flags.hideCliOptions === "boolean"
						? flags.hideCliOptions
						: !("showCliOptions" in flags && flags.showCliOptions === true);
				return {
					...current,
					hideCliOptions,
					showCliOptions: !hideCliOptions,
					hideProFeatures: !(
						"hideProFeatures" in flags && flags.hideProFeatures === false
					),
				};
			},
		},
	),
);
export const useForkCliOptions = () =>
	useForkCliOptionsStore((state) => state.showCliOptions);

export const useForkProFeatures = () =>
	useForkCliOptionsStore((state) => !state.hideProFeatures);
