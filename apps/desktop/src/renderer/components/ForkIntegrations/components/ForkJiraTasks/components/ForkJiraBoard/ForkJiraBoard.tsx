import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkTransitionFields } from "../../../ForkTransitionFields/ForkTransitionFields";
import { jiraStatusTone } from "../../fork-jira-query";
import { ForkJiraTaskCard } from "../ForkJiraTaskCard";

export function ForkJiraBoard({
	tasks,
	selected,
	onSelect,
}: {
	tasks: ForkTask[];
	selected?: string;
	onSelect: (key: string) => void;
}) {
	const { formatNumber } = useFormat();
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const [moving, setMoving] = useState<ForkTask | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [transitionId, setTransitionId] = useState("");
	const [fields, setFields] = useState<Record<string, unknown>>({});
	const transitions = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"board-transitions",
			moving?.connectionId,
			moving?.key,
		],
		queryFn: () =>
			required(client).forkTasks.transitions.query({
				connectionId: required(moving).connectionId,
				key: required(moving).key,
			}),
		enabled: !!moving && !!client && (data?.version ?? 0) >= 4,
		retry: false,
		networkMode: "always",
	});
	const chosen = transitions.data?.find(
		(transition) => transition.id === transitionId,
	);
	const move = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: ({
			id,
			values,
		}: {
			id: string;
			values: Record<string, unknown>;
		}) =>
			required(client).forkTasks.transition.mutate({
				connectionId: required(moving).connectionId,
				key: required(moving).key,
				transitionId: id,
				fields: values,
			}),
		onSuccess: () => {
			setMoving(null);
			setTransitionId("");
			setFields({});
		},
		onSettled: () =>
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl],
			}),
	});
	const categories = ["new", "indeterminate", "done"];
	const groups = [
		...new Map([
			...tasks.map((task) => [task.status.id, task.status] as const),
			...(transitions.data ?? []).flatMap((transition) =>
				transition.to ? [[transition.to.id, transition.to] as const] : [],
			),
		]).values(),
	].sort(
		(a, b) => categories.indexOf(a.category) - categories.indexOf(b.category),
	);
	const choose = (id: string) => {
		const transition = transitions.data?.find((entry) => entry.id === id);
		if (!transition || move.isPending) return;
		if (transition.fields.some((field) => field.required)) {
			setTransitionId(id);
			setFields({});
		} else move.mutate({ id, values: {} });
	};
	return (
		<div className="space-y-3">
			{(transitions.error || move.error) && (
				<p role="alert" className="text-sm text-destructive">
					{(transitions.error ?? move.error)?.message}
				</p>
			)}
			<div className="flex min-h-full items-start gap-3">
				{groups.map((group) => {
					const entries = tasks.filter((task) => task.status.id === group.id);
					const destination = transitions.data?.find(
						(transition) => transition.to?.id === group.id,
					);
					const droppable =
						!!destination && moving?.status.id !== group.id && !move.isPending;
					return (
						<fieldset
							aria-label={group.name}
							key={group.id}
							className={cn(
								"w-72 shrink-0 rounded-xl border border-border/60 bg-muted/25 p-2.5",
								over === group.id && droppable && "ring-2 ring-primary",
							)}
							onDragOver={(event) => {
								if (droppable) {
									event.preventDefault();
									event.dataTransfer.dropEffect = "move";
									setOver(group.id);
								}
							}}
							onDragLeave={() => setOver(null)}
							onDrop={(event) => {
								event.preventDefault();
								setOver(null);
								if (
									droppable &&
									destination &&
									event.dataTransfer.getData(
										"application/x-superset-jira-issue",
									) === moving?.id
								)
									choose(destination.id);
							}}
						>
							<div className="mb-3 flex items-center gap-2 px-1 py-1">
								<span
									className={cn(
										"size-2 rounded-full bg-current",
										jiraStatusTone(group.category),
									)}
								/>
								<h2 className="text-xs font-medium">{group.name}</h2>
								<span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
									{formatNumber(entries.length)}
								</span>
							</div>
							<div className="min-h-20 space-y-2">
								{entries.map((task) => (
									<fieldset
										key={task.id}
										aria-label={task.key}
										draggable={(data?.version ?? 0) >= 4 && !move.isPending}
										onDragStart={(event) => {
											event.dataTransfer.setData(
												"application/x-superset-jira-issue",
												task.id,
											);
											event.dataTransfer.effectAllowed = "move";
											move.reset();
											setMoving(task);
										}}
										onDragEnd={() => setOver(null)}
									>
										<ForkJiraTaskCard
											task={task}
											selected={selected === task.key}
											board
											onClick={() => onSelect(task.key)}
										/>
										{(data?.version ?? 0) >= 4 && (
											<Button
												size="sm"
												variant="ghost"
												className="h-6 text-[10px]"
												disabled={move.isPending}
												onClick={() => {
													move.reset();
													setTransitionId("");
													setMoving(task);
												}}
											>
												<Trans>Move</Trans>
											</Button>
										)}
									</fieldset>
								))}
							</div>
						</fieldset>
					);
				})}
			</div>
			{moving && !transitionId && (
				<div
					className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
					aria-live="polite"
				>
					<span className="text-xs">{moving.key}</span>
					{transitions.isFetching ? (
						<span className="text-xs text-muted-foreground">
							<Trans>Loading...</Trans>
						</span>
					) : (
						transitions.data?.map((transition) => (
							<Button
								key={transition.id}
								size="sm"
								variant="outline"
								disabled={move.isPending}
								onClick={() => choose(transition.id)}
							>
								{transition.name}
							</Button>
						))
					)}
					<Button
						size="sm"
						variant="ghost"
						disabled={move.isPending}
						onClick={() => setMoving(null)}
					>
						<Trans>Cancel</Trans>
					</Button>
				</div>
			)}
			<Dialog
				open={!!chosen}
				onOpenChange={(open) => {
					if (!open && !move.isPending) setTransitionId("");
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{chosen?.name}</DialogTitle>
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							move.mutate({ id: transitionId, values: fields });
						}}
					>
						<ForkTransitionFields
							fields={chosen?.fields ?? []}
							values={fields}
							onChange={setFields}
						/>
						{move.error && (
							<p role="alert" className="text-sm text-destructive">
								{move.error.message}
							</p>
						)}
						<Button type="submit" disabled={move.isPending}>
							<Trans>Save</Trans>
						</Button>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
