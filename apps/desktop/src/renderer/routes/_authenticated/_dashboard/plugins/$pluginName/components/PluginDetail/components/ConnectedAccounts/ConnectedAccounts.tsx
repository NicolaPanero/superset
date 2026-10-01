import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuEllipsis, LuPlus, LuUnplug } from "react-icons/lu";
import { useConnector } from "renderer/components/ConnectorSection/hooks/useConnector";

interface ConnectedAccountsProps {
	slug: string;
	/** False before the plugin is installed: connecting would grant an account
	 * to something that contributes no tools yet. */
	canConnect: boolean;
	onConnect: () => void;
}

function initials(label: string): string {
	const trimmed = label.trim();
	const named = trimmed.split(/[\s@._-]+/).filter(Boolean);
	return (named[0]?.[0] ?? "?").concat(named[1]?.[0] ?? "").toUpperCase();
}

export function ConnectedAccounts({
	slug,
	canConnect,
	onConnect,
}: ConnectedAccountsProps) {
	const { t } = useLingui();
	const { connector, connections, isPending, disconnect } = useConnector(slug);

	if (isPending || !connector) return null;

	return (
		<div className="overflow-hidden rounded-xl border border-border/60">
			{connections.map((connection, index) => {
				const label =
					connection.externalUserLabel ??
					connection.externalAccountLabel ??
					connection.id;
				return (
					<div
						key={connection.id}
						className="flex items-center gap-3 border-border/40 px-4 py-3 not-first:border-t"
					>
						<Avatar className="size-9">
							<AvatarFallback className="text-xs">
								{initials(label)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium text-foreground">
								{label}
							</div>
							<p className="text-xs text-muted-foreground">
								{index === 0 ? (
									<Trans>Primary</Trans>
								) : (
									connection.externalAccountLabel
								)}
							</p>
						</div>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 shrink-0 text-muted-foreground"
									aria-label={t({ message: `Manage ${label}` })}
								>
									<LuEllipsis className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									disabled={disconnect.isPending}
									onSelect={() =>
										disconnect.mutate({ connectionId: connection.id })
									}
								>
									<LuUnplug className="size-3.5 shrink-0 text-current" />
									<Trans>Disconnect</Trans>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				);
			})}

			{canConnect &&
			(connector.scope === "user" || connections.length === 0) ? (
				<button
					type="button"
					onClick={onConnect}
					className="flex w-full items-center gap-3 border-border/40 px-4 py-3 text-left transition-colors not-first:border-t hover:bg-foreground/[0.03]"
				>
					<span className="flex size-9 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
						<LuPlus className="size-4" />
					</span>
					<span className="text-sm text-foreground">
						{connections.length === 0 ? (
							<Trans>Connect an account</Trans>
						) : (
							<Trans>Connect another account</Trans>
						)}
					</span>
				</button>
			) : null}
		</div>
	);
}
