import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useForkAccountLogin(
	input: {
		hostUrl: string | null;
		agent: "claude" | "codex";
		credentialKind: "subscription" | "api_key";
		loginId: string;
		enabled: boolean;
	},
	connect = getHostServiceClientByUrl,
) {
	const { hostUrl, agent, credentialKind, loginId, enabled } = input;
	return useQuery({
		queryKey: ["fork-account-login", hostUrl, agent, credentialKind, loginId],
		enabled: !!hostUrl && enabled,
		queryFn: async ({ signal }) => {
			if (!hostUrl) return null;
			const usage = connect(hostUrl).usage;
			const result = await usage.finishAccountLogin.mutate({
				agent,
				credentialKind,
				loginId,
			});
			if (!result || signal.aborted) return null;
			await usage.prepareAccount.mutate({
				agent,
				selection: result.selection,
				isolated: true,
			});
			return signal.aborted ? null : result;
		},
		refetchInterval: (query) =>
			query.state.error || query.state.data ? false : 3_000,
		refetchIntervalInBackground: true,
		retry: false,
		gcTime: 0,
	});
}
