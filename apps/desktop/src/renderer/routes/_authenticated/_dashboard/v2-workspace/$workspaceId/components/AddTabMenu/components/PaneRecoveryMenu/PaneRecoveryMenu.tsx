import { Trans } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import {
	LuFile,
	LuGlobe,
	LuHistory,
	LuLoaderCircle,
	LuTerminal,
} from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type { usePaneRecovery } from "../../../../hooks/usePaneRecovery";

export function PaneRecoveryMenu({
	recovery,
	onRestored,
}: {
	recovery: ReturnType<typeof usePaneRecovery>;
	onRestored: () => void;
}) {
	const isDark = useIsDarkTheme();
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="gap-2">
				<LuHistory className="size-4" />
				<Trans>Recently deleted</Trans>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-80">
				<div className="max-h-80 overflow-y-auto">
					{!recovery.history.length ? (
						<DropdownMenuItem disabled>
							<Trans>No recently deleted panes</Trans>
						</DropdownMenuItem>
					) : (
						recovery.history.map((item) => {
							const pending = recovery.restoringId === item.id;
							const error =
								recovery.restoreError?.id === item.id
									? recovery.restoreError.message
									: null;
							const icon = item.descriptor.agentId
								? getPresetIcon(item.descriptor.agentId, isDark)
								: null;
							const Icon =
								item.kind === "browser"
									? LuGlobe
									: item.kind === "file"
										? LuFile
										: LuTerminal;
							const cwd = item.descriptor.cwd;
							const directory = cwd?.split(/[\\/]/).filter(Boolean).at(-1);
							return (
								<DropdownMenuItem
									key={item.id}
									disabled={recovery.isRestoring}
									onSelect={(event) => {
										event.preventDefault();
										void recovery.restore(item.id).then((restored) => {
											if (restored) onRestored();
										});
									}}
									className="flex items-start gap-2.5 py-2"
								>
									{icon ? (
										<img
											src={icon}
											alt=""
											className="mt-0.5 size-4 shrink-0 object-contain"
										/>
									) : (
										<Icon
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-muted-foreground"
										/>
									)}
									<span className="min-w-0 flex-1">
										<span className="block truncate">
											{item.title || <Trans>Terminal</Trans>}
										</span>
										{directory && (
											<span
												title={cwd}
												className="block truncate text-xs text-muted-foreground"
											>
												{directory}
											</span>
										)}
										<span className="block text-xs text-muted-foreground">
											{formatCompactRelativeTime(item.closedAt)}
										</span>
										{error && (
											<span
												role="alert"
												className="mt-1 block whitespace-normal text-xs text-destructive"
											>
												{error}
											</span>
										)}
									</span>
									<span
										aria-live="polite"
										className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
									>
										{pending ? (
											<>
												<LuLoaderCircle
													aria-hidden="true"
													className="size-3 animate-spin"
												/>
												<Trans>Restoring…</Trans>
											</>
										) : error ? (
											<Trans>Retry</Trans>
										) : (
											<Trans>Restore</Trans>
										)}
									</span>
								</DropdownMenuItem>
							);
						})
					)}
				</div>
				<DropdownMenuSeparator />
				<p className="px-2 py-1 text-xs text-muted-foreground">
					<Trans>Available for 24 hours</Trans>
				</p>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
