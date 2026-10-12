import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export interface AccountLaunchRequest {
	hostUrl: string;
	agent: string;
	provider: string;
	selection?: string | null;
	model?: string;
	isCurrent?: () => boolean;
}

export async function validateAccountLaunch(
	request: AccountLaunchRequest,
	clientForHost = getHostServiceClientByUrl,
): Promise<boolean> {
	if (request.isCurrent?.() === false) return false;
	if (request.provider !== "claude" && request.provider !== "codex")
		return true;
	try {
		const metadata = await clientForHost(
			request.hostUrl,
		).usage.launchAccount.query({
			agent: request.agent,
			selection: request.selection,
			isolated: true,
			validate: true,
		});
		if (
			metadata.isolationVersion === 1 &&
			request.selection === undefined &&
			!metadata.environmentOverride &&
			!metadata.defaultSelection
		) {
			toast.error(i18n._(msg({ message: "Choose an account" })));
			return false;
		}
	} catch (error) {
		const code = (error as { data?: { code?: string } }).data?.code;
		if (code !== "NOT_FOUND" || request.selection !== undefined) {
			toast.error(i18n._(msg({ message: "Couldn't start agent session" })), {
				description:
					(error as { message?: string }).message ===
					"account_reconnect_required"
						? i18n._(msg({ message: "Reconnect account" }))
						: errorMessage(error),
			});
			return false;
		}
	}
	return request.isCurrent?.() !== false;
}
