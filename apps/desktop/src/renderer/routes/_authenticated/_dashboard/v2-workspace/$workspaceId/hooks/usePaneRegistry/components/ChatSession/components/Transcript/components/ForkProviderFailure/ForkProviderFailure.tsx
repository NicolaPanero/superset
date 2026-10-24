import { Trans } from "@lingui/react/macro";

export function ForkProviderFailure({ text }: { text?: string }) {
	if (!text) return null;
	if (/\[unavailable\]/i.test(text) && /PING timed out/i.test(text))
		return (
			<p className="mt-1 text-muted-foreground">
				<Trans>
					The model connection timed out. Continue from the last saved part.
				</Trans>
			</p>
		);
	if (/\[resource_exhausted\]/i.test(text))
		return (
			<p className="mt-1 text-muted-foreground">
				<Trans>
					The model provider reported an error. Wait and retry, or switch
					models.
				</Trans>
			</p>
		);
	return null;
}
