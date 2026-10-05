import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useAgentAccountAliases(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const queryKey = ["agent-account-aliases", hostUrl] as const;
	const query = useQuery({
		queryKey,
		enabled: !!hostUrl,
		retry: false,
		staleTime: 30_000,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).usage.accountAliases.query()
				: [],
	});
	const rename = useMutation({
		mutationFn: async (input: {
			agent: "claude" | "codex";
			selection: string | null;
			label: string | null;
		}) => {
			if (!hostUrl) throw new Error("host_unavailable");
			return getHostServiceClientByUrl(hostUrl).usage.setAccountAlias.mutate(
				input,
			);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey });
			await queryClient.invalidateQueries({
				queryKey: ["agent-launch-account-options", hostUrl],
			});
		},
	});
	return { ...query, rename };
}
