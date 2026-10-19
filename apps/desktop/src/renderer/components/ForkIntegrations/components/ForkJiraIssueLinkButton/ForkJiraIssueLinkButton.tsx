import { useLingui } from "@lingui/react/macro";
import {
	type ForkTask,
	forkTaskBranch,
} from "@superset/shared/fork-integrations";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useForkJiraSearch } from "../../hooks/useForkJiraSearch";
import { forkJiraLinkedIssue } from "../../utils/forkJiraWorkspace";
import { ForkProviderIcon } from "../ForkProviderIcon";

/** Links a Jira issue to the new-workspace draft; hidden without a Jira account. */
export function ForkJiraIssueLinkButton({ className }: { className?: string }) {
	const { t } = useLingui();
	const search = useForkJiraSearch();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const debounced = useDebouncedValue(query.trim(), 300);
	const issues = useQuery({
		queryKey: ["fork-integrations", "jira-link", debounced],
		queryFn: () => search?.(debounced) ?? [],
		enabled: open && !!search,
		retry: false,
		staleTime: 30_000,
	});
	if (!search) return null;
	const select = (task: ForkTask) => {
		const draft = useNewWorkspaceDraftStore.getState();
		setOpen(false);
		setQuery("");
		if (draft.linkedIssues.some((issue) => issue.slug === task.key)) return;
		draft.updateDraft({
			linkedIssues: [...draft.linkedIssues, forkJiraLinkedIssue(task)],
			...(!draft.branchNameEdited && !draft.branchName.trim()
				? {
						branchName: forkTaskBranch(task.key, task.title),
						branchNameEdited: true,
						branchNameFromProvider: false,
					}
				: {}),
			...(!draft.workspaceNameEdited && !draft.workspaceName.trim()
				? {
						workspaceName: `${task.key} ${task.title}`,
						workspaceNameEdited: true,
					}
				: {}),
		});
	};
	const label = t({ message: "Link Jira issue" });
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (!next) setQuery("");
				setOpen(next);
			}}
		>
			<Tooltip>
				<PopoverTrigger asChild>
					<TooltipTrigger asChild>
						<PromptInputButton aria-label={label} className={className}>
							<ForkProviderIcon provider="jira" className="size-3.5" />
						</PromptInputButton>
					</TooltipTrigger>
				</PopoverTrigger>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
			<PopoverContent className="w-[440px] p-0" align="start" side="bottom">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({ message: "Search Jira…" })}
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList className="max-h-[420px]">
						<CommandEmpty>
							{issues.isFetching
								? t({ message: "Searching…" })
								: issues.error
									? issues.error.message
									: t({ message: "No issues found." })}
						</CommandEmpty>
						{issues.data && issues.data.length > 0 && (
							<CommandGroup
								heading={
									debounced
										? t({ message: "Results" })
										: t({ message: "Assigned to you" })
								}
							>
								{issues.data.map((task) => (
									<CommandItem
										key={task.id}
										value={task.id}
										onSelect={() => select(task)}
										className="items-start gap-3 px-2.5 py-2"
									>
										{task.type?.iconUrl ? (
											<img
												alt=""
												className="mt-0.5 size-4"
												src={task.type.iconUrl}
											/>
										) : (
											<ForkProviderIcon
												provider="jira"
												className="mt-0.5 size-4"
											/>
										)}
										<div className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="truncate text-sm">{task.title}</span>
											<span className="text-[11px] text-muted-foreground">
												<span className="font-mono">{task.key}</span> ·{" "}
												{task.status.name}
											</span>
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
