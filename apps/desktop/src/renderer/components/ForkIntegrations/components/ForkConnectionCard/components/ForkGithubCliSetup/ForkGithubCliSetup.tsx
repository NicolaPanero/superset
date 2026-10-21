import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { HiArrowUpRight, HiCommandLine } from "react-icons/hi2";

export function ForkGithubCliSetup({
	brewAvailable,
	busy,
	onInstall,
	onCheck,
}: {
	brewAvailable: boolean | undefined;
	busy: boolean;
	onInstall: () => void;
	onCheck: () => void;
}) {
	return (
		<div className="mt-3 flex gap-3 rounded-lg border bg-muted/30 p-3 sm:ml-13">
			<HiCommandLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 space-y-2.5">
				<div className="space-y-1">
					<p className="text-xs font-medium">
						<Trans>GitHub CLI (gh) is not installed.</Trans>
					</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{brewAvailable === undefined ? (
							<Trans>Checking…</Trans>
						) : brewAvailable ? (
							<Trans>
								The guided terminal installs gh with Homebrew and opens GitHub
								sign-in.
							</Trans>
						) : (
							<Trans>
								The guide opens in your browser. Install gh on this computer,
								then check again.
							</Trans>
						)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						disabled={busy || brewAvailable === undefined}
						onClick={onInstall}
					>
						{brewAvailable === undefined ? (
							<Trans>Checking…</Trans>
						) : brewAvailable ? (
							<Trans>Install GitHub CLI</Trans>
						) : (
							<>
								<Trans>Open installation guide</Trans>
								<HiArrowUpRight className="size-3.5" />
							</>
						)}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={onCheck}
					>
						{busy ? <Trans>Checking…</Trans> : <Trans>Check again</Trans>}
					</Button>
				</div>
			</div>
		</div>
	);
}
