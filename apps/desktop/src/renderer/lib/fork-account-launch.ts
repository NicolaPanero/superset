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
): Promise<boolean> {
	if (request.isCurrent?.() === false) return false;
	if (request.provider !== "claude" && request.provider !== "codex")
		return true;
	try {
		await getHostServiceClientByUrl(request.hostUrl).usage.launchAccount.query({
			agent: request.agent,
			selection: request.selection,
		});
	} catch (error) {
		const code = (error as { data?: { code?: string } }).data?.code;
		if (code !== "NOT_FOUND" || request.selection !== undefined) {
			toast.error(i18n._(msg({ message: "Couldn't start agent session" })), {
				description: errorMessage(error),
			});
			return false;
		}
	}
	return request.isCurrent?.() !== false;
}
