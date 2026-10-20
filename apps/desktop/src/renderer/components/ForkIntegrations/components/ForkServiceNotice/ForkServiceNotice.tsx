import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkProviderId } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuTriangleAlert } from "react-icons/lu";

export function ForkServiceNotice({
	provider,
	onRetry,
	sidebar = false,
}: {
	provider: ForkProviderId;
	onRetry?: () => void;
	sidebar?: boolean;
}) {
	const { t } = useLingui();
	const name = { github: "GitHub", bitbucket: "Bitbucket", jira: "Jira" }[
		provider
	];
	const title = t({ message: `${name} unreachable` });
	const detail = t({
		message:
			"The service is temporarily unavailable. Superset will retry automatically. Your account settings are unchanged.",
	});
	if (sidebar)
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="mx-2 mt-1 flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-amber-600 dark:text-amber-400"
					>
						<LuTriangleAlert className="size-4 shrink-0" />
						<span className="truncate">{title}</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="right" className="max-w-72 text-wrap-pretty">
					{detail}
				</TooltipContent>
			</Tooltip>
		);
	return (
		<div
			aria-live="polite"
			className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm"
		>
			<LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
			<div className="min-w-0 flex-1">
				<p className="font-medium">{title}</p>
				<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
			</div>
			{onRetry && (
				<Button size="sm" variant="outline" onClick={onRetry}>
					<Trans>Try again</Trans>
				</Button>
			)}
		</div>
	);
}
