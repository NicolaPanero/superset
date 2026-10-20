import { createContext, type ReactNode, useContext } from "react";

export interface ForkContextUsage {
	usage?: { used: number; size: number };
	running: boolean;
	/** Sends the agent's own /compact, when it advertises one. */
	compact?: () => void;
}

const ForkContextUsageContext = createContext<ForkContextUsage | null>(null);

/** The chat's context usage, for the fork's composer controls. */
export function ForkContextUsageProvider({
	value,
	children,
}: {
	value: ForkContextUsage;
	children: ReactNode;
}) {
	return (
		<ForkContextUsageContext.Provider value={value}>
			{children}
		</ForkContextUsageContext.Provider>
	);
}

export function useForkContextUsage() {
	return useContext(ForkContextUsageContext);
}
