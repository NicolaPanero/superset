import type { RendererContext } from "@superset/panes";
import type { ReactNode } from "react";
import type { PaneViewerData } from "../../../../types";
import { ForkAccountSwitchProvider } from "../ChatSession/providers/ForkAccountSwitchProvider";
import { useForkAccountSwitch } from "./hooks/useForkAccountSwitch";

export function ForkAccountSwitch({
	ctx,
	workspaceId,
	children,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	children: ReactNode;
}) {
	return (
		<ForkAccountSwitchProvider value={useForkAccountSwitch(workspaceId, ctx)}>
			{children}
		</ForkAccountSwitchProvider>
	);
}
