import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

export interface AccountLabelSource {
	nickname?: string | null;
	externalUserLabel?: string | null;
	externalAccountLabel?: string | null;
}

export function accountIdentity(source: AccountLabelSource): string | null {
	return source.externalUserLabel ?? source.externalAccountLabel ?? null;
}

export function accountLabels(
	source: AccountLabelSource,
	connectorName: string,
): { title: string; subtitle: string | null } {
	const identity = accountIdentity(source);
	const title =
		source.nickname ||
		identity ||
		i18n._(
			msg({
				message: `${connectorName} account`,
			}),
		);
	return {
		title,
		subtitle: identity && identity !== title ? identity : null,
	};
}
