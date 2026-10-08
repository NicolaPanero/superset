import { createContext, type ReactNode, useContext } from "react";

export interface ForkAccountChoice {
	selection: string | null;
	name: string;
	email: string | null;
	plan: string | null;
	isSystemDefault: boolean;
	/** The tightest quota window, when the account's usage is known. */
	usage: { label: string; usedPercent: number } | null;
}

/** The logins a chat's agent can run on; picking one moves the chat there. */
export interface ForkAccountSwitcher {
	agentLabel: string;
	current: string | null | undefined;
	accounts: ForkAccountChoice[];
	switching: boolean;
	onSwitch: (selection: string | null) => void;
}

const ForkAccountSwitchContext = createContext<ForkAccountSwitcher | undefined>(
	undefined,
);

export function ForkAccountSwitchProvider({
	value,
	children,
}: {
	value: ForkAccountSwitcher | undefined;
	children: ReactNode;
}) {
	return (
		<ForkAccountSwitchContext.Provider value={value}>
			{children}
		</ForkAccountSwitchContext.Provider>
	);
}

export function useForkAccountSwitcher() {
	return useContext(ForkAccountSwitchContext);
}
