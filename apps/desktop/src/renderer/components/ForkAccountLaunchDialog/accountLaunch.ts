import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import { toast } from "@superset/ui/sonner";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export interface AccountLaunchRequest {
	hostUrl: string;
	agent: string;
	provider: string;
	selection?: string | null;
	model?: string;
	isCurrent?: () => boolean;
	chooseOther?: () => void;
}
export interface AccountLaunchPrompt {
	request: AccountLaunchRequest;
	account?: UsageAccount;
	forcedApi: boolean;
	resolve: (approved: boolean) => void;
}
let current: AccountLaunchPrompt | null = null;
const listeners = new Set<() => void>();
export const accountLaunchSnapshot = () => current;
export const subscribeAccountLaunch = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
const emit = () => {
	for (const listener of listeners) listener();
};
export function cancelAccountLaunch() {
	current?.resolve(false);
}
export async function refreshAccountLaunch(prompt: AccountLaunchPrompt) {
	const accounts = await getHostServiceClientByUrl(
		prompt.request.hostUrl,
	).usage.quota.query({ forceRefresh: true });
	if (current !== prompt) return;
	current = {
		...prompt,
		account: accounts.find(
			(a) =>
				a.agent === prompt.request.provider &&
				(prompt.request.selection === undefined
					? a.isDefault
					: a.selection === prompt.request.selection),
		),
	};
	emit();
}

export async function confirmAccountLaunch(
	request: AccountLaunchRequest,
): Promise<boolean> {
	if (request.provider !== "claude" && request.provider !== "codex")
		return true;
	const client = getHostServiceClientByUrl(request.hostUrl);
	let forcedApi = false;
	try {
		const metadata = await client.usage.launchAccount.query({
			agent: request.agent,
			selection: request.selection,
		});
		forcedApi = metadata.environmentOverride;
	} catch (error) {
		const code = (error as { data?: { code?: string } }).data?.code;
		if (code !== "NOT_FOUND" || request.selection !== undefined) {
			toast.error(i18n._(msg({ message: "Couldn't start agent session" })), {
				description: errorMessage(error),
			});
			return false;
		}
	}
	const accounts = await client.usage.quota
		.query()
		.catch(() => [] as UsageAccount[]);
	const account = accounts.find(
		(a) =>
			a.agent === request.provider &&
			(request.selection === undefined
				? a.isDefault
				: a.selection === request.selection),
	);
	if (request.isCurrent?.() === false) return false;
	if (
		!forcedApi &&
		accountQuotaState(account, request.model).reason === "ready"
	)
		return true;
	cancelAccountLaunch();
	const approved = await new Promise<boolean>((resolve) => {
		current = {
			request,
			account,
			forcedApi,
			resolve: (value) => {
				current = null;
				emit();
				resolve(value);
			},
		};
		emit();
	});
	return approved && request.isCurrent?.() !== false;
}
