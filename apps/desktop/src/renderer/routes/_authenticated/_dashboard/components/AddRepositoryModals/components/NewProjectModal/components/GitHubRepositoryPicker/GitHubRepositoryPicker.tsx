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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FaBitbucket } from "react-icons/fa";
import { HiCheck } from "react-icons/hi2";
import { LuChevronsUpDown, LuGithub } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface GitHubRepositoryPickerProps {
	disabled: boolean;
	hostUrl: string | null;
	onSelect: (repository: {
		cloneUrl: string;
		fullName: string;
		connectionId?: string;
	}) => void;
	selectedFullName: string | null;
}

export function GitHubRepositoryPicker({
	disabled,
	hostUrl,
	onSelect,
	selectedFullName,
}: GitHubRepositoryPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [account, setAccount] = useState("");
	const accounts = useQuery({
		queryKey: ["fork-integrations", hostUrl, "connections"],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl!).forkConnections.list.query(),
		enabled: open && !!hostUrl,
		retry: false,
	});
	const bitbucket =
		accounts.data?.connections.filter(
			(c) => c.provider === "bitbucket" && c.enabled,
		) ?? [];
	const Icon = account ? FaBitbucket : LuGithub;
	const repositoriesQuery = useInfiniteQuery({
		initialPageParam: undefined as string | undefined,
		queryKey: ["github-repositories", hostUrl, account],
		queryFn: ({ pageParam }) => {
			if (!hostUrl) throw new Error("No active host");
			const client = getHostServiceClientByUrl(hostUrl);
			if (account)
				return client.forkScm.repositories.query({
					connectionId: account,
					cursor: pageParam,
				});
			return client.project.listGitHubRepositories
				.query()
				.then((items) => ({ items, nextCursor: null as string | null }));
		},
		enabled: open && !disabled && hostUrl !== null,
		staleTime: 60_000,
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const repositories =
		repositoriesQuery.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium">
				<Trans>Repositories</Trans>
			</span>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						className="justify-between font-normal"
						disabled={disabled || !hostUrl}
						variant="outline"
					>
						{selectedFullName ? (
							<>
								<span className="flex min-w-0 items-center gap-2">
									<Icon className="size-4 shrink-0 text-muted-foreground" />
									<span className="truncate">{selectedFullName}</span>
								</span>
								<HiCheck className="size-4 shrink-0 text-muted-foreground" />
							</>
						) : (
							<>
								<span className="text-muted-foreground">
									<Trans>Select repositories</Trans>
								</span>
								<LuChevronsUpDown className="size-4 shrink-0 opacity-50" />
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[var(--radix-popover-trigger-width)] p-0"
				>
					{bitbucket.length > 0 && (
						<select
							className="m-2 h-9 w-[calc(100%-1rem)] rounded-md border bg-background px-2 text-sm"
							aria-label={t({ message: "Account" })}
							value={account}
							onChange={(e) => setAccount(e.target.value)}
						>
							<option value="">GitHub</option>
							{bitbucket.map((c) => (
								<option key={c.id} value={c.id}>
									Bitbucket · {c.identity?.login ?? c.label}
								</option>
							))}
						</select>
					)}
					<Command>
						<CommandInput
							placeholder={t({ message: "Search repositories..." })}
						/>
						<CommandList className="max-h-64">
							<CommandEmpty>
								{repositoriesQuery.isLoading ? (
									<Trans>Loading repositories...</Trans>
								) : repositoriesQuery.isError ? (
									repositoriesQuery.error.message
								) : (
									<Trans>No matches</Trans>
								)}
							</CommandEmpty>
							<CommandGroup>
								{repositories.map((repository) => {
									const selected = repository.fullName === selectedFullName;
									return (
										<CommandItem
											key={repository.fullName}
											onSelect={() => {
												onSelect({
													...repository,
													connectionId: account || undefined,
												});
												setOpen(false);
											}}
											value={repository.fullName}
										>
											<Icon className="size-4 shrink-0 text-muted-foreground" />
											<span className="flex-1 truncate">
												{repository.fullName}
											</span>
											{selected && (
												<HiCheck className="size-4 shrink-0 text-muted-foreground" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
					{repositoriesQuery.hasNextPage && (
						<Button
							variant="ghost"
							size="sm"
							disabled={repositoriesQuery.isFetchingNextPage}
							onClick={() => void repositoriesQuery.fetchNextPage()}
						>
							<Trans>Load more</Trans>
						</Button>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}
