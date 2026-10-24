import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { forkPullRequestRefFromUrl } from "renderer/lib/fork-pull-request-ref";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { forkBitbucketMergeMethod } from "../utils/fork-bitbucket-merge-method";
import { required } from "../utils/required";
import { useForkConnections } from "./useForkConnections";

interface Input {
	owner: string;
	repo: string;
	pullNumber: number;
	mergeMethod?: "merge" | "squash" | "rebase";
}

export function useForkWorkspacePrMutation<
	M extends { isPending: boolean; mutate: (input: Input) => void },
>(
	original: M,
	workspaceId: string,
	action: "merge" | "ready",
	onRefresh?: () => void,
	prUrl?: string,
) {
	const { t } = useLingui();
	const { hostUrl } = useWorkspace();
	const { client, data } = useForkConnections(hostUrl);
	const cache = useQueryClient();
	const utils = workspaceTrpc.useUtils();
	const pr = workspaceTrpc.git.getPullRequest.useQuery({ workspaceId });
	const fork = useMutation({
		mutationFn: async (input: Input) => {
			if (action === "ready" && (data?.version ?? 0) < 7)
				throw new Error(
					t({ message: "Update the host to use Bitbucket drafts." }),
				);
			const linked = await required(client).forkScm.workspace.query({
				workspaceId,
			});
			const repository = required(linked.repository);
			if (repository.provider !== "bitbucket")
				throw new Error(t({ message: "Could not load pull request." }));
			const target = {
				connectionId: required(linked.connectionId),
				repository,
				number: input.pullNumber,
			};
			const latest = await required(client).forkScm.get.query(target);
			const method = forkBitbucketMergeMethod(
				input.mergeMethod ?? "merge",
				latest.mergeMethods,
			);
			if (action === "merge" && !method)
				throw new Error(
					t({
						message: "This merge method is not available for the repository.",
					}),
				);
			return required(client).forkScm.action.mutate({
				...target,
				action: action === "ready" ? "set-draft" : "merge",
				draft: action === "ready" ? false : undefined,
				head: latest.headCommit,
				method,
			});
		},
		onMutate: () => ({
			toastId: toast.loading(
				action === "merge"
					? t({ message: "Merging PR..." })
					: t({ message: "Marking ready for review..." }),
			),
		}),
		onSuccess: (_result, _input, context) => {
			toast.success(
				action === "merge"
					? t({ message: "PR merged" })
					: t({ message: "PR ready for review" }),
				{ id: context?.toastId },
			);
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
			void cache.invalidateQueries({ queryKey: ["pullRequests"] });
			void utils.git.getPullRequest.invalidate({ workspaceId });
			onRefresh?.();
		},
		onError: (error, _input, context) =>
			toast.error(
				action === "merge"
					? t({ message: `Merge failed: ${error.message}` })
					: t({ message: `Ready for review failed: ${error.message}` }),
				{ id: context?.toastId },
			),
	});
	return {
		...original,
		isPending: original.isPending || fork.isPending,
		mutate: (input: Input) => {
			if (forkPullRequestRefFromUrl(prUrl ?? pr.data?.url ?? ""))
				fork.mutate(input);
			else original.mutate(input);
		},
	};
}
