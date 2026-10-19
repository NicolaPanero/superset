import type { SessionConfigOption } from "@superset/chat/protocol";
import { createContext, type ReactNode, useContext } from "react";

export type ForkComposerControls = (props: {
	configOptions: SessionConfigOption[];
	onSelect?: (configId: string, value: string) => void;
}) => ReactNode;

const ForkComposerControlsContext = createContext<
	ForkComposerControls | undefined
>(undefined);

/** Lets the fork render the composer's model and account controls. */
export function ForkComposerControlsProvider({
	value,
	children,
}: {
	value: ForkComposerControls | undefined;
	children: ReactNode;
}) {
	return (
		<ForkComposerControlsContext.Provider value={value}>
			{children}
		</ForkComposerControlsContext.Provider>
	);
}

export function useForkComposerControls() {
	return useContext(ForkComposerControlsContext);
}
