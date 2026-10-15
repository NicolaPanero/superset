import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ForkHomeAppearance {
	interactiveBackground: boolean;
	setInteractiveBackground: (enabled: boolean) => void;
}

export const useForkHomeAppearance = create<ForkHomeAppearance>()(
	persist(
		(set) => ({
			interactiveBackground: true,
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
					typeof saved.interactiveBackground === "boolean"
						? saved.interactiveBackground
						: current.interactiveBackground,
			}),
		},
	),
);
