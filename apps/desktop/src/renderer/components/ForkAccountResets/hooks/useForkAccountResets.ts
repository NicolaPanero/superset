import type { AppRouter } from "@superset/host-service";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "renderer/hooks/host-service/useHostUsageQuota";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type AccountResetStatus =
	inferRouterOutputs<AppRouter>["usage"]["accountResets"];
export function useForkAccountResets(
	hostUrl: string | null,
	account: UsageAccount,
	clientForHost = getHostServiceClientByUrl,
) {
	const client = useQueryClient();
	const queryKey = [
		"fork-account-resets",
		account.agent,
		hostUrl,
		account.selection,
		account.email,
	];
	const enabled =
		!!hostUrl &&
		account.agent === "codex" &&
		account.credentialKind === "subscription" &&
		account.selection !== null &&
		account.status !== "signed_out";
	const query = useQuery({
		queryKey,
		enabled,
		queryFn: () =>
			clientForHost(hostUrl as string).usage.accountResets.query({
				selection: account.selection as string,
			}),
		retry: false,
		throwOnError: false,
		staleTime: 300_000,
		gcTime: 300_000,
		refetchInterval: 300_000,
	});
	const consume = useMutation({
		retry: false,
		throwOnError: false,
		mutationFn: (input: {
			idempotencyKey: string;
			creditId?: string;
			expectedIdentity: string;
		}) => {
			if (!enabled || !hostUrl || !account.selection)
				throw new Error("reset_account_unavailable");
			return clientForHost(hostUrl).usage.consumeAccountReset.mutate({
				selection: account.selection,
				...input,
			});
		},
		onSettled: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey }),
				client.invalidateQueries({
					queryKey: [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl],
				}),
			]);
		},
	});
	return { ...query, consume, enabled };
}
