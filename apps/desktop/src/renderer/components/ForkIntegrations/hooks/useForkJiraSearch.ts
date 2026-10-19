import type { ForkTask } from "@superset/shared/fork-integrations";
import { useCallback } from "react";
import { forkJiraQuery } from "../components/ForkJiraTasks/fork-jira-query";
import { useForkConnections } from "./useForkConnections";

/**
 * Searches the default Jira account: my unfinished issues with no query,
 * any issue matching the text otherwise. Null when Jira is not connected.
 */
export function useForkJiraSearch() {
	const { client, connections } = useForkConnections();
	const jira = connections.filter((c) => c.provider === "jira" && c.enabled);
	const connectionId = (jira.find((c) => c.isDefault) ?? jira[0])?.id;
	const search = useCallback(
		async (query: string): Promise<ForkTask[]> => {
			if (!client || !connectionId) return [];
			const text = query.trim();
			const run = (projectKeys: string[]) =>
				client.forkTasks.list.query({
					connectionId,
					jql: forkJiraQuery({
						search: text,
						scope: text ? "all" : "mine",
						status: "open",
						project: "",
						jql: "",
						projectKeys,
					}),
				});
			const prefix = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(text)?.[1];
			// Jira rejects a key of an unknown project; then it is plain text.
			const page = prefix
				? await run([prefix]).catch(() => run([]))
				: await run([]);
			return page.items.slice(0, 20);
		},
		[client, connectionId],
	);
	return connectionId ? search : null;
}
