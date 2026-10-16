import { Trans } from "@lingui/react/macro";
import { SUPPORTED_LOCALES } from "@superset/i18n";
import type { ReactNode } from "react";
import { OnboardingLanguageRow } from "renderer/routes/_authenticated/onboarding/components/OnboardingLanguageRow";
import { ForkIntegrations } from "../../ForkIntegrations";
import { useForkConnections } from "../../hooks/useForkConnections";
export function ForkOnboardingConnections({
	fallback,
}: {
	fallback: ReactNode;
}) {
	const { data, isError } = useForkConnections();
	if (isError) return fallback;
	if (!data)
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	return (
		<div className="space-y-5">
			{SUPPORTED_LOCALES.length > 1 && <OnboardingLanguageRow />}
			<ForkIntegrations />
			<p className="text-xs text-muted-foreground">
				<Trans>
					You can configure these connections later in Fork Settings.
				</Trans>
			</p>
		</div>
	);
}
