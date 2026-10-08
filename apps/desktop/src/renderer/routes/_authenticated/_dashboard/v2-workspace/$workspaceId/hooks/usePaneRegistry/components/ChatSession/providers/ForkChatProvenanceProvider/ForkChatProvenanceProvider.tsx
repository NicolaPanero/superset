import { createContext, type ReactNode, useContext } from "react";

/** The agent and login a handed-over chat continued from. */
export interface ForkChatProvenance {
	label: string;
	email: string | null;
}

const ForkChatProvenanceContext = createContext<ForkChatProvenance | null>(
	null,
);

export function ForkChatProvenanceProvider({
	value,
	children,
}: {
	value: ForkChatProvenance | null;
	children: ReactNode;
}) {
	return (
		<ForkChatProvenanceContext.Provider value={value}>
			{children}
		</ForkChatProvenanceContext.Provider>
	);
}

export function useForkChatProvenance() {
	return useContext(ForkChatProvenanceContext);
}
