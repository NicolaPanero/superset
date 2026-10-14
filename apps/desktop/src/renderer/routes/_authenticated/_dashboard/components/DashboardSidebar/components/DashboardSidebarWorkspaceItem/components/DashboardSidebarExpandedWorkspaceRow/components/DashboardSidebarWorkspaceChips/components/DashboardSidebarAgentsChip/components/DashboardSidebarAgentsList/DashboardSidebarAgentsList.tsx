import type { DashboardSidebarRunningAgent } from "../../../../hooks/useDashboardSidebarWorkspaceRunningAgents";
import { DashboardSidebarAgentHoverRow } from "../DashboardSidebarAgentHoverRow";
import { useDashboardSidebarAgentTitles } from "./hooks/useDashboardSidebarAgentTitles";

export function DashboardSidebarAgentsList({
	workspaceId,
	agents,
}: {
	workspaceId: string;
	agents: DashboardSidebarRunningAgent[];
}) {
	const titles = useDashboardSidebarAgentTitles(workspaceId, agents);
	return (
		<div className="max-h-60 overflow-y-auto">
			{agents.map((agent) => (
				<DashboardSidebarAgentHoverRow
					key={agent.sourceKey}
					workspaceId={workspaceId}
					agent={agent}
					sessionTitle={titles.get(agent.terminalId)}
				/>
			))}
		</div>
	);
}
