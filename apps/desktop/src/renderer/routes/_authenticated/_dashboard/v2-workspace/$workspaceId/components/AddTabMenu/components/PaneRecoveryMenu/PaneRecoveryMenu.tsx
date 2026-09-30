import { Trans } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { LuHistory } from "react-icons/lu";
import type { usePaneRecovery } from "../../../../hooks/usePaneRecovery";

export function PaneRecoveryMenu({
	recovery,
}: {
	recovery: ReturnType<typeof usePaneRecovery>;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="gap-2">
				<LuHistory className="size-4" />
				<Trans>Recently deleted</Trans>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-80 w-80 overflow-y-auto">
				{!recovery.history.length ? (
					<DropdownMenuItem disabled>
						<Trans>No recently deleted panes</Trans>
					</DropdownMenuItem>
				) : (
					recovery.history.map((item) => (
						<DropdownMenuItem
							key={item.id}
							disabled={recovery.isRestoring}
							onSelect={() => void recovery.restore(item.id)}
							className="flex items-center justify-between gap-3"
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate">
									{item.title || <Trans>Terminal</Trans>}
								</span>
								<span className="block text-xs text-muted-foreground">
									{formatCompactRelativeTime(item.closedAt)}
								</span>
							</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								<Trans>Restore</Trans>
							</span>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
