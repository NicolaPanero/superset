import type { WorkspaceState } from "@superset/panes";
import type {
	ChatPaneData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function resolveAgentSessionTitles({
	layouts,
	terminalTitles,
	sessions,
	agents,
}: {
	layouts: (WorkspaceState<unknown> | undefined)[];
	terminalTitles: ReadonlyMap<string, string | null>;
	sessions: { terminalId?: string | null; title: string | null }[];
	agents: { terminalId: string; label: string }[];
}): Map<string, string> {
	const titles = new Map<string, string>();
	for (const [id, title] of terminalTitles) {
		if (title?.trim()) titles.set(id, title.trim());
	}
	for (const session of sessions) {
		if (session.terminalId && session.title?.trim()) {
			titles.set(session.terminalId, session.title.trim());
		}
	}
	const agentLabels = new Map(
		agents.map((agent) => [agent.terminalId, agent.label]),
	);
	for (const layout of layouts) {
		for (const tab of layout?.tabs ?? []) {
			const panes = Object.values(tab.panes);
			for (const pane of panes) {
				if (pane.kind !== "chat-v3" && pane.kind !== "terminal") continue;
				const data = pane.data as ChatPaneData | TerminalPaneData;
				const agentLabel = agentLabels.get(data.terminalId);
				const tabTitle =
					panes.length === 1 || tab.activePaneId === pane.id
						? tab.titleOverride
						: undefined;
				const paneTitle =
					pane.titleOverride !== agentLabel ? pane.titleOverride : undefined;
				const title = [
					tabTitle,
					paneTitle,
					data.chatTitle,
					titles.get(data.terminalId),
					pane.kind === "terminal"
						? (data as TerminalPaneData).cliTitle
						: undefined,
				].find((value) => value?.trim());
				if (title) titles.set(data.terminalId, title.trim());
			}
		}
	}
	return titles;
}
