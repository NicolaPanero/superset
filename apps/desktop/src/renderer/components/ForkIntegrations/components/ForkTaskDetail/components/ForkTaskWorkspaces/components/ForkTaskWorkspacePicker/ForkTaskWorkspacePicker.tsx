import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuCheck, LuGitBranch, LuLink, LuLoaderCircle } from "react-icons/lu";
import { useForkConnections } from "../../../../../../hooks/useForkConnections";
import { required } from "../../../../../../utils/required";

export function ForkTaskWorkspacePicker({
	task,
	linkedWorkspaceIds,
	disabled,
}: {
	task: ForkTask;
	linkedWorkspaceIds: string[];
	disabled: boolean;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const cache = useQueryClient();
	const [open, setOpen] = useState(false);
	const workspaces = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "workspaces"],
		queryFn: () => required(client).workspace.list.query(),
		enabled: !!client && open,
	});
	const link = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: (workspaceId: string) =>
			required(client).forkTasks.link.mutate({
				connectionId: task.connectionId,
				key: task.key,
				workspaceId,
			}),
		onSuccess: () => {
			setOpen(false);
			toast.success(t({ message: "Task linked to workspace." }));
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
		},
	});
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next && !link.isPending) link.reset();
			}}
		>
			<PopoverTrigger asChild>
				<Button
					size="xs"
					variant="ghost"
					className="text-muted-foreground"
					disabled={disabled || !client}
				>
					<LuLink className="size-3.5" />
					<Trans>Link existing workspace</Trans>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				aria-label={t({ message: "Link existing workspace" })}
				className="w-80 max-w-[calc(100vw-2rem)] p-0"
			>
				<Command label={t({ message: "Search workspaces" })}>
					<CommandInput
						aria-label={t({ message: "Search workspaces" })}
						placeholder={t({ message: "Search workspaces…" })}
					/>
					<CommandList>
						{workspaces.isError ? (
							<div className="space-y-2 p-3">
								<p role="alert" className="text-xs text-destructive">
									{workspaces.error.message}
								</p>
								<Button
									size="xs"
									variant="outline"
									onClick={() => void workspaces.refetch()}
								>
									<Trans>Try again</Trans>
								</Button>
							</div>
						) : (
							<CommandEmpty>
								{workspaces.isPending ? (
									<Trans>Loading…</Trans>
								) : (
									<Trans>No workspaces found.</Trans>
								)}
							</CommandEmpty>
						)}
						<CommandGroup>
							{workspaces.data?.map((workspace) => {
								const linked = linkedWorkspaceIds.includes(workspace.id);
								return (
									<CommandItem
										key={workspace.id}
										value={workspace.id}
										keywords={[
											workspace.name ?? "",
											workspace.projectName ?? "",
											workspace.branch ?? "",
										]}
										disabled={linked || link.isPending}
										onSelect={() => link.mutate(workspace.id)}
										className="gap-2.5 rounded-md px-2.5 py-2"
									>
										<LuGitBranch className="size-4" />
										<span className="min-w-0 flex-1">
											<span className="block truncate">
												{workspace.name || workspace.id}
											</span>
											{(workspace.projectName || workspace.branch) && (
												<span className="block truncate text-xs text-muted-foreground">
													{[workspace.projectName, workspace.branch]
														.filter(Boolean)
														.join(" · ")}
												</span>
											)}
										</span>
										{link.isPending && link.variables === workspace.id ? (
											<LuLoaderCircle className="size-3.5 animate-spin" />
										) : linked ? (
											<LuCheck className="size-3.5" />
										) : null}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
					{link.isError && (
						<p
							role="alert"
							className="border-t px-3 py-2 text-xs text-destructive"
						>
							{link.error.message}
						</p>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
