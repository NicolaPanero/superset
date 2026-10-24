import { useLingui } from "@lingui/react/macro";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { required } from "../utils/required";
import { useForkConnections } from "./useForkConnections";

export function useForkDraftGuard(workspaceId: string) {
	const { t } = useLingui();
	const { hostUrl } = useWorkspace();
	const { client } = useForkConnections(hostUrl);
	return async (draft: boolean) => {
		if (!draft || !client) return;
		const connections = await client.forkConnections.list
			.query()
			.catch((error: { data?: { code?: string } }) => {
				if (error.data?.code === "NOT_FOUND") return null;
				throw error;
			});
		if (!connections?.version || connections.version >= 7) return;
		const workspace = await required(client).forkScm.workspace.query({
			workspaceId,
		});
		if (workspace.repository?.provider === "bitbucket")
			throw new Error(
				t({ message: "Update the host to use Bitbucket drafts." }),
			);
	};
}
