import { createContext, type ReactNode, useContext } from "react";

interface MessageActions {
	nativeFork: boolean;
	busy: boolean;
	textBranch?: (itemId: string) => void;
}
const Context = createContext<MessageActions | null>(null);
export function ForkMessageActionsProvider({
	value,
	children,
}: {
	value: MessageActions;
	children: ReactNode;
}) {
	return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useForkMessageActions = () => useContext(Context);
