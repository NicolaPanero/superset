import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ForkHomeAppearance {
	interactiveBackground: boolean;
	setInteractiveBackground: (enabled: boolean) => void;
}

export const useForkHomeAppearance = create<ForkHomeAppearance>()(
	persist(
		(set) => ({
			interactiveBackground: false,
			setInteractiveBackground: (enabled) =>
				set({ interactiveBackground: enabled }),
		}),
		{
			name: "superset-fork-home-appearance",
			partialize: ({ interactiveBackground }) => ({ interactiveBackground }),
			merge: (saved, current) => ({
				...current,
				interactiveBackground:
					!!saved &&
					typeof saved === "object" &&
					"interactiveBackground" in saved &&
					saved.interactiveBackground === true,
			}),
		},
	),
);
