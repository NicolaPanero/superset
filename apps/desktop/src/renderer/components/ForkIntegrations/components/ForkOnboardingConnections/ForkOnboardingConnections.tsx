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
	if (!data && !isError)
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	return (
		<div className="space-y-5">
			{!isError && SUPPORTED_LOCALES.length > 1 && <OnboardingLanguageRow />}
			<div className="space-y-1.5 text-sm">
				<p className="font-medium">
					<Trans>Repository access is separate from Superset sign-in.</Trans>
				</p>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Connect GitHub here to access its repositories and pull requests on
						this computer. You can continue without it when using local folders
						or another Git provider.
					</Trans>
				</p>
			</div>
			{isError ? fallback : <ForkIntegrations />}
			<p className="text-xs text-muted-foreground">
				<Trans>
					You can configure these connections later in Fork Settings.
				</Trans>
			</p>
		</div>
	);
}
