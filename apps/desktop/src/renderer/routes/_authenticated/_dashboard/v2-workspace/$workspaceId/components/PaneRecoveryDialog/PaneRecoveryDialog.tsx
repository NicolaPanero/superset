import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useRef } from "react";
import { LuFile, LuGlobe, LuLoaderCircle, LuTerminal } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type { usePaneRecovery } from "../../hooks/usePaneRecovery";

export function PaneRecoveryDialog({
	recovery,
}: {
	recovery: ReturnType<typeof usePaneRecovery>;
}) {
	const isDark = useIsDarkTheme();
	const restored = useRef(false);
	return (
		<Dialog open={recovery.historyOpen} onOpenChange={recovery.setHistoryOpen}>
			<DialogContent
				className="sm:max-w-md"
				onCloseAutoFocus={(event) => {
					if (restored.current) {
						event.preventDefault();
						restored.current = false;
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Recently deleted</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Available for 24 hours</Trans>
					</DialogDescription>
				</DialogHeader>
				<div
					className="max-h-80 overflow-y-auto"
					aria-busy={recovery.isLoading}
				>
					{recovery.isLoading ? (
						<output className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
							<LuLoaderCircle
								aria-hidden="true"
								className="size-4 animate-spin"
							/>
							<Trans>Loading…</Trans>
						</output>
					) : recovery.historyError ? (
						<div className="space-y-3 py-4">
							<p role="alert" className="text-sm text-destructive">
								{errorMessage(recovery.historyError)}
							</p>
							<Button
								variant="outline"
								onClick={() => void recovery.refetchHistory()}
							>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : !recovery.history.length ? (
						<p className="py-8 text-center text-sm text-muted-foreground">
							<Trans>No recently deleted panes</Trans>
						</p>
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
								<button
									type="button"
									key={item.id}
									disabled={recovery.isRestoring}
									onClick={() => {
										void recovery.restore(item.id).then((success) => {
											if (success) {
												restored.current = true;
												recovery.setHistoryOpen(false);
											}
										});
									}}
									className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
											formatCompactRelativeTime(item.closedAt)
										)}
									</span>
								</button>
							);
						})
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
