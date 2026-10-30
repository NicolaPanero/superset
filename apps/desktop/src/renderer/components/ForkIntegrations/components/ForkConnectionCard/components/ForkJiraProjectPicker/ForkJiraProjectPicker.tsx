import { Trans, useLingui } from "@lingui/react/macro";
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
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FolderKanban, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export function ForkJiraProjectPicker({
	connectionId,
	value,
	onChange,
	disabled = false,
	id,
}: {
	connectionId: string;
	value: string;
	onChange: (key: string) => void;
	disabled?: boolean;
	id?: string;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const [open, setOpen] = useState(false);
	const listId = useId();
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-projects", connectionId],
		queryFn: () => required(client).forkTasks.projects.query({ connectionId }),
		enabled: !!client && !disabled,
		staleTime: 300_000,
		retry: false,
	});
	const selected = projects.data?.find((project) => project.key === value);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-controls={listId}
					disabled={disabled || !client}
					className="h-auto min-h-11 w-full justify-between gap-3 bg-background px-3 py-2 text-left font-normal"
				>
					<FolderKanban
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden
					/>
					<span className="min-w-0 flex-1">
						{value ? (
							<>
								<span className="block truncate text-sm font-medium">
									{selected?.name ?? value}
								</span>
								<span className="block font-mono text-[11px] text-muted-foreground">
									{value}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">
								<Trans>Select a project</Trans>
							</span>
						)}
					</span>
					{projects.isFetching ? (
						<Loader2
							className="size-4 shrink-0 animate-spin text-muted-foreground"
							aria-hidden
						/>
					) : (
						<ChevronsUpDown
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden
						/>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[var(--radix-popover-trigger-width)] p-0"
			>
				<Command>
					<CommandInput placeholder={t({ message: "Search projects..." })} />
					<CommandList id={listId} className="max-h-64">
						{projects.isError ? (
							<div className="space-y-2 p-3">
								<p role="alert" className="text-xs text-destructive">
									{projects.error.message}
								</p>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => void projects.refetch()}
								>
									<Trans>Retry</Trans>
								</Button>
							</div>
						) : (
							<>
								<CommandEmpty>
									{projects.isPending ? (
										<Trans>Loading...</Trans>
									) : (
										<Trans>No projects found</Trans>
									)}
								</CommandEmpty>
								<CommandGroup>
									{projects.data?.map((project) => (
										<CommandItem
											key={project.id}
											value={project.key}
											keywords={[project.name]}
											onSelect={() => {
												onChange(project.key);
												setOpen(false);
											}}
											className="gap-3 py-2.5"
										>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium">
													{project.name}
												</span>
												<span className="block font-mono text-[11px] text-muted-foreground">
													{project.key}
												</span>
											</span>
											{project.key === value && (
												<Check className="size-4 shrink-0" aria-hidden />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
