import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuArrowRight, LuGitBranch, LuUnlink } from "react-icons/lu";

export function ForkTaskWorkspaceRow({
	workspace,
	unlinking,
	onUnlink,
}: {
	workspace: { id: string; name: string | null };
	unlinking: boolean;
	onUnlink: () => void;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	return (
		<li className="group flex min-w-0 items-center gap-1 p-1">
			<Button
				size="sm"
				variant="ghost"
				className="min-w-0 flex-1 justify-start gap-2.5 font-normal"
				title={workspace.name || workspace.id}
				onClick={() =>
					void navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: workspace.id },
					})
				}
			>
				<LuGitBranch className="size-3.5 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate text-left">
					{workspace.name || workspace.id}
				</span>
				<LuArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
			</Button>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="icon-xs"
						variant="ghost"
						className="text-muted-foreground"
						aria-label={t({ message: "Unlink" })}
						disabled={unlinking}
						onClick={onUnlink}
					>
						<LuUnlink className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t({ message: "Unlink" })}</TooltipContent>
			</Tooltip>
		</li>
	);
}
