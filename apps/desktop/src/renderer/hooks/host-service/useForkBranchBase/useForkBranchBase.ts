import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";

export function useForkBranchBase(
	workspaceId: string,
	options: { enabled?: boolean; remember?: boolean } = {},
) {
	const enabled = options.enabled ?? true;
	const utils = workspaceTrpc.useUtils();
	const query = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId, inferOrigin: true },
		{
			enabled: enabled && !!workspaceId,
			staleTime: Number.POSITIVE_INFINITY,
			refetchOnMount: "always",
			refetchOnWindowFocus: "always",
		},
	);
	const saved = useRef<string | null>(null);
	const remember = workspaceTrpc.git.setBaseBranch.useMutation({
		onSuccess: () => {
			void utils.git.getBaseBranch.invalidate({ workspaceId });
		},
	});
	const base = query.data;
	useEffect(() => {
		if (
			!options.remember ||
			!enabled ||
			base?.source !== "reflog" ||
			!base.baseBranch ||
			!base.currentBranch
		)
			return;
		const key = `${workspaceId}:${base.currentBranch}:${base.baseBranch}`;
		if (saved.current === key) return;
		saved.current = key;
		remember.mutate({
			workspaceId,
			baseBranch: base.baseBranch,
			expectedBranch: base.currentBranch,
			onlyIfUnset: true,
		});
	}, [options.remember, enabled, base, workspaceId, remember.mutate]);
	return {
		...query,
		data: {
			...base,
			baseBranch: base
				? base.needsSelection
					? "HEAD"
					: base.baseBranch
				: "HEAD",
		},
	};
}
