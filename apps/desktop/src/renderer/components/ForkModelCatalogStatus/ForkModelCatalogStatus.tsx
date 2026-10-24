import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

export function ForkModelCatalogStatus({
	loading,
	error,
	refresh,
}: {
	loading: boolean;
	error: boolean;
	refresh: () => void;
}) {
	return (
		<div
			className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground"
			aria-live="polite"
		>
			<span>
				{loading ? (
					<Trans>Loading models…</Trans>
				) : error ? (
					<Trans>Models unavailable. Check the agent and host.</Trans>
				) : (
					<Trans>Models provided by the agent</Trans>
				)}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-6 shrink-0 px-2 text-xs"
				disabled={loading}
				onClick={refresh}
			>
				<Trans>Refresh</Trans>
			</Button>
		</div>
	);
}
