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
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export function ForkTransitionUserPicker({
	task,
	id,
	value,
	onChange,
}: {
	task: ForkTask;
	id: string;
	value: unknown;
	onChange: (value: unknown) => void;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [picked, setPicked] = useState<{ id: string; name: string } | null>(
		null,
	);
	const query = useDebouncedValue(search, 200);
	const users = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"assignees",
			task.connectionId,
			task.key,
			query,
		],
		queryFn: () =>
			required(client).forkTasks.assignees.query({
				connectionId: task.connectionId,
				key: task.key,
				query,
			}),
		enabled: !!client && open,
		retry: false,
	});
	const accountId = (value as { accountId?: string } | undefined)?.accountId;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					role="combobox"
					aria-expanded={open}
					variant="outline"
					className="w-full justify-between font-normal"
				>
					<span className="min-w-0 truncate">
						{picked && picked.id === accountId
							? picked.name
							: (accountId ?? <Trans>Unassigned</Trans>)}
					</span>
					<ChevronsUpDown className="size-3.5 shrink-0" aria-hidden />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[var(--radix-popover-trigger-width)] p-0"
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({ message: "Search..." })}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList>
						<CommandEmpty>
							{users.isPending ? (
								<Trans>Loading...</Trans>
							) : (
								<Trans>No matches</Trans>
							)}
						</CommandEmpty>
						{users.error && (
							<p role="alert" className="p-3 text-xs text-destructive">
								{users.error.message}
							</p>
						)}
						<CommandGroup>
							{users.data?.map((user) => (
								<CommandItem
									key={user.id}
									value={user.id}
									onSelect={() => {
										setPicked(user);
										onChange({ accountId: user.id });
										setOpen(false);
									}}
								>
									<span className="min-w-0 flex-1 truncate">{user.name}</span>
									{accountId === user.id && (
										<Check className="size-3.5" aria-hidden />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
