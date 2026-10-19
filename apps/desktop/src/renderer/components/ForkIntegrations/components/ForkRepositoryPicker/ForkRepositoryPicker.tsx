import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkConnection } from "@superset/shared/fork-integrations";
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
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuCheck,
	LuChevronsUpDown,
	LuFolderGit2,
	LuRefreshCw,
} from "react-icons/lu";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkServiceNotice } from "../ForkServiceNotice";
import {
	type ForkRepositoryChoice,
	forkListRepositories,
	forkUniqueRepositories,
} from "./fork-repository-picker";

export function ForkRepositoryPicker({
	disabled,
	hostUrl,
	onSelect,
	selectedFullName,
}: {
	disabled: boolean;
	hostUrl: string | null;
	onSelect: (repository: {
		cloneUrl: string;
		fullName: string;
		connectionId?: string;
	}) => void;
	selectedFullName: string | null;
}) {
	const { t } = useLingui();
	const cache = useQueryClient();
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<ForkRepositoryChoice | null>(null);
	const { client, connections, data, isPending } = useForkConnections(hostUrl);
	const supported = !!data?.version;
	const accounts = supported
		? connections
				.filter((c) => c.enabled && c.provider !== "jira")
				.sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault))
		: [
				{
					id: "system:github",
					provider: "github",
					label: "GitHub",
				} as ForkConnection,
			];
	const [pagination, setPagination] = useState<{
		host: string | null;
		cursors: Record<string, string[]>;
	}>({ host: hostUrl, cursors: {} });
	const targets = accounts.flatMap((account) =>
		[
			undefined,
			...(pagination.host === hostUrl
				? (pagination.cursors[account.id] ?? [])
				: []),
		].map((cursor) => ({ account, cursor })),
	);
	const queries = useQueries({
		queries: targets.map(({ account, cursor }) => ({
			queryKey: [
				"fork-integrations",
				hostUrl,
				"repository-picker",
				supported,
				account.id,
				cursor,
			],
			networkMode: "always",
			retry: false,
			refetchOnReconnect: true,
			queryFn: ({ queryKey }) =>
				forkListRepositories(
					required(client),
					[account],
					cursor ? { [account.id]: cursor } : {},
					supported,
					cache.getQueryData<Awaited<ReturnType<typeof forkListRepositories>>>(
						queryKey,
					)?.items,
				),
			enabled: open && !disabled && !!client && !isPending,
			staleTime: 60_000,
		})),
	});
	const repositories = forkUniqueRepositories(
		queries.flatMap((query) => query.data?.items ?? []),
	);
	const unavailable = new Set(
		queries.flatMap((query) => query.data?.unavailable ?? []),
	);
	const failed = new Set(
		queries
			.flatMap((query) => query.data?.errors ?? [])
			.filter((id) => !unavailable.has(id)),
	);
	const unavailableProviders = [
		...new Set(
			accounts.filter((c) => unavailable.has(c.id)).map((c) => c.provider),
		),
	];
	const next = accounts.flatMap((account) => {
		const index = targets.findLastIndex(
			(target) => target.account.id === account.id,
		);
		const cursor = queries[index]?.data?.nextCursors[account.id];
		return cursor && !pagination.cursors[account.id]?.includes(cursor)
			? [{ id: account.id, cursor }]
			: [];
	});
	const loadMore = () =>
		setPagination((previous) => {
			const cursors = previous.host === hostUrl ? { ...previous.cursors } : {};
			for (const page of next)
				cursors[page.id] = [...(cursors[page.id] ?? []), page.cursor];
			return { host: hostUrl, cursors };
		});
	const selectedRepository =
		selected?.fullName === selectedFullName
			? selected
			: repositories.find((repo) => repo.fullName === selectedFullName);
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium">
				<Trans>Repositories</Trans>
			</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						className="justify-between font-normal"
						disabled={disabled || !hostUrl}
						variant="outline"
					>
						<span className="flex min-w-0 items-center gap-2">
							{selectedRepository ? (
								<ForkProviderIcon
									provider={selectedRepository.provider}
									className="size-4"
								/>
							) : (
								<LuFolderGit2 className="size-4 shrink-0 text-muted-foreground" />
							)}
							<span className="truncate">
								{selectedFullName ?? <Trans>Select repositories</Trans>}
							</span>
						</span>
						<LuChevronsUpDown className="size-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[var(--radix-popover-trigger-width)] p-0"
				>
					<Command>
						<CommandInput
							placeholder={t({ message: "Search repositories..." })}
						/>
						<CommandList className="max-h-72">
							<CommandEmpty>
								{queries.some((query) => query.isPending) || isPending ? (
									<Trans>Loading repositories...</Trans>
								) : (
									<Trans>No matches</Trans>
								)}
							</CommandEmpty>
							<CommandGroup>
								{repositories.map((repository) => {
									const account = accounts.find(
										(c) => c.id === repository.connectionId,
									);
									return (
										<CommandItem
											key={`${repository.provider}:${repository.fullName}`}
											value={`${repository.provider}:${repository.fullName}`}
											onSelect={() => {
												setSelected(repository);
												onSelect(repository);
												setOpen(false);
											}}
										>
											<ForkProviderIcon
												provider={repository.provider}
												className="size-4"
											/>
											<span className="min-w-0 flex-1 truncate">
												{repository.fullName}
											</span>
											{account?.identity?.login && (
												<span className="max-w-24 truncate text-[10px] text-muted-foreground">
													{account.identity.login}
												</span>
											)}
											{selectedFullName === repository.fullName &&
												selectedRepository?.provider ===
													repository.provider && (
													<LuCheck className="size-3.5 shrink-0" />
												)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
					{unavailableProviders.map((provider) => (
						<div key={provider} className="border-t p-2">
							<ForkServiceNotice
								provider={provider}
								onRetry={() => {
									for (const query of queries) void query.refetch();
								}}
							/>
						</div>
					))}
					{(failed.size > 0 || (!isPending && !accounts.length)) && (
						<div className="flex items-center gap-2 border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
							<div className="flex gap-1.5">
								{[
									...new Set(
										accounts
											.filter((c) => failed.has(c.id))
											.map((c) => c.provider),
									),
								].map((provider) => (
									<ForkProviderIcon key={provider} provider={provider} />
								))}
							</div>
							<Link
								to="/settings/fork"
								onClick={() => setOpen(false)}
								className="flex-1 hover:text-foreground"
							>
								<Trans>Configure integrations in Fork Settings.</Trans>
							</Link>
							<Button
								size="icon-xs"
								variant="ghost"
								aria-label={t({ message: "Try again" })}
								onClick={() => {
									for (const query of queries) void query.refetch();
								}}
							>
								<LuRefreshCw className="size-3" />
							</Button>
						</div>
					)}
					{next.length > 0 && (
						<Button
							className="w-full rounded-t-none border-t"
							variant="ghost"
							size="sm"
							disabled={queries.some((query) => query.isFetching)}
							onClick={loadMore}
						>
							<Trans>Load more</Trans>
						</Button>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}
