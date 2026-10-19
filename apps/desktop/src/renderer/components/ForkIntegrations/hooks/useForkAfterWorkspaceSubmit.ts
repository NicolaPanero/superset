import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { LinkedIssue } from "renderer/stores/new-workspace-draft";
import type { SubmitOutcome } from "renderer/stores/workspace-creates/useWorkspaceCreates";
import { forkStartJiraWork } from "../utils/forkJiraWorkspace";

/** Work the fork does once a workspace from the new-workspace screen exists. */
export function useForkAfterWorkspaceSubmit() {
	const { machineId, activeHostUrl } = useLocalHostService();
	const organizationId = useActiveOrganizationId();
	const relayUrl = useRelayUrl();
	return useCallback(
		(
			hostId: string,
			issues: LinkedIssue[],
			completed: Promise<SubmitOutcome>,
		) => {
			if (!organizationId || !issues.some((i) => i.source === "jira")) return;
			const hostUrl = resolveHostUrl({
				hostId,
				machineId,
				activeHostUrl,
				organizationId,
				relayUrl,
			});
			if (!hostUrl) return;
			void completed.then((outcome) => {
				if (!outcome.ok) return;
				return forkStartJiraWork(
					getHostServiceClientByUrl(hostUrl),
					outcome.workspaceId,
					issues,
				);
			});
		},
		[machineId, activeHostUrl, organizationId, relayUrl],
	);
}
