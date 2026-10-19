import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import { LuServer } from "react-icons/lu";
import type { ForkMcpServerSummary } from "../../hooks/useForkMcp";

export function ForkMcpServerRow({
	server,
	pending,
	onToggle,
	onEdit,
	onDelete,
}: {
	server: ForkMcpServerSummary;
	pending: boolean;
	onToggle: (enabled: boolean) => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { t } = useLingui();
	const target =
		server.transport === "stdio"
			? [server.command, ...server.args].join(" ")
			: server.url;
	return (
		<div className="flex items-center gap-4 px-5 py-3.5">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
				<LuServer className="size-4" />
			</div>
			<div className={cn("min-w-0 flex-1", !server.enabled && "opacity-60")}>
				<div className="flex items-center gap-2">
					<h4 className="truncate text-sm font-medium">{server.name}</h4>
					<span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
						{server.transport}
					</span>
				</div>
				<p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
					{target}
					{server.secretNames.length > 0 &&
						` · ${server.secretNames.join(", ")}`}
				</p>
			</div>
			<Switch
				aria-label={
					server.enabled ? t({ message: "Disable" }) : t({ message: "Enable" })
				}
				checked={server.enabled}
				disabled={pending}
				onCheckedChange={onToggle}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						size="icon"
						variant="ghost"
						className="size-8"
						aria-label={t({ message: "More actions" })}
					>
						<HiEllipsisHorizontal className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={onEdit}>
						<Trans>Edit</Trans>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onSelect={onDelete}>
						<Trans>Delete</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
