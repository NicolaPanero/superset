import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import {
	formatForkDuration,
	parseForkDuration,
} from "../../../ForkTaskDetail/components/ForkTaskWorklog/utils/forkDuration";

interface Draft {
	include: boolean;
	time: string;
	duration: string;
}

const dayLabel = (day: string) =>
	formatDate(new Date(`${day}T12:00:00`), {
		weekday: "short",
		day: "numeric",
		month: "short",
	});

export function ForkTimesheetProposal({
	connectionId,
}: {
	connectionId: string;
}) {
	const { t } = useLingui();
	const { client } = useForkConnections();
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [logged, setLogged] = useState<ReadonlySet<string>>(new Set());
	const propose = useMutation({
		mutationFn: () =>
			required(client).forkTasks.timesheetPropose.mutate({
				connectionId,
				...(from ? { from } : {}),
				...(to ? { to } : {}),
			}),
		onSuccess: (proposal) => {
			setLogged(new Set());
			post.reset();
			setDrafts(
				Object.fromEntries(
					proposal.entries.map((entry) => [
						entry.id,
						{
							include: true,
							time: entry.time,
							duration: formatForkDuration(entry.seconds),
						},
					]),
				),
			);
		},
	});
	const post = useMutation({
		mutationFn: () =>
			required(client).forkTasks.timesheetPost.mutate({
				proposalId: required(proposal).id,
				entries: selected,
			}),
		onSuccess: (results) =>
			setLogged(
				(current) =>
					new Set([
						...current,
						...results.filter((result) => result.ok).map((result) => result.id),
					]),
			),
	});
	const proposal = propose.data;
	const selected = (proposal?.entries ?? []).flatMap((entry) => {
		if (logged.has(entry.id)) return [];
		const draft = drafts[entry.id];
		const seconds = draft ? parseForkDuration(draft.duration) : null;
		return draft?.include && seconds
			? [
					{
						id: entry.id,
						key: entry.key,
						date: entry.date,
						time: draft.time,
						seconds,
					},
				]
			: [];
	});
	const invalid = (proposal?.entries ?? []).some((entry) => {
		const draft = drafts[entry.id];
		return draft?.include && !parseForkDuration(draft.duration);
	});
	const selectedCount = selected.length;
	const selectedDuration = formatForkDuration(
		selected.reduce((sum, entry) => sum + entry.seconds, 0),
	);
	const results = new Map(
		(post.data ?? []).map((result) => [result.id, result]),
	);
	const patch = (id: string, value: Partial<Draft>) =>
		setDrafts((current) => {
			const existing = current[id];
			return existing
				? { ...current, [id]: { ...existing, ...value } }
				: current;
		});
	const tasks = new Map(
		(proposal?.tasks ?? []).map((task) => [task.key, task]),
	);
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-end gap-2">
				<div className="space-y-1">
					<Label htmlFor={`timesheet-from-${connectionId}`}>
						<Trans>From</Trans>
					</Label>
					<Input
						id={`timesheet-from-${connectionId}`}
						type="date"
						value={from}
						onChange={(e) => setFrom(e.target.value)}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor={`timesheet-to-${connectionId}`}>
						<Trans>To</Trans>
					</Label>
					<Input
						id={`timesheet-to-${connectionId}`}
						type="date"
						value={to}
						onChange={(e) => setTo(e.target.value)}
					/>
				</div>
				<Button
					size="sm"
					variant="outline"
					disabled={propose.isPending || !!from !== !!to}
					onClick={() => propose.mutate()}
				>
					<Trans>Propose hours</Trans>
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				<Trans>
					A proposal for working days below the minimum, from tasks you closed
					without time and tasks still in progress. Nothing goes to Jira until
					you confirm. Without dates: the last 30 days.
				</Trans>
			</p>
			{propose.error && (
				<p role="alert" className="text-xs text-destructive">
					{propose.error.message}
				</p>
			)}
			{proposal && (
				<div className="space-y-3">
					{proposal.entries.length === 0 && (
						<p className="text-sm text-muted-foreground">
							<Trans>Nothing to propose in this period.</Trans>
						</p>
					)}
					{proposal.skippedFullDays.length > 0 && (
						<p className="text-xs text-muted-foreground">
							<Trans>Days already full:</Trans>{" "}
							{proposal.skippedFullDays.map(dayLabel).join(", ")}
						</p>
					)}
					{proposal.gaps.length > 0 && (
						<p
							role="alert"
							className="text-xs text-amber-600 dark:text-amber-400"
						>
							<Trans>
								Some days stay outside the hour limits. Fix them by hand or in
								Jira; registering is disabled.
							</Trans>{" "}
							{proposal.gaps.map((gap) => dayLabel(gap.date)).join(", ")}
						</p>
					)}
					{proposal.tasks.some((task) => task.inflated) && (
						<p className="text-xs text-amber-600 dark:text-amber-400">
							<Trans>Tasks with much more time than their share:</Trans>{" "}
							{proposal.tasks
								.filter((task) => task.inflated)
								.map(
									(task) => `${task.key} (${formatForkDuration(task.seconds)})`,
								)
								.join(", ")}
						</p>
					)}
					{proposal.entries.length > 0 && (
						<div className="overflow-x-auto rounded-lg border">
							<table className="w-full text-sm">
								<thead className="bg-muted/30 text-left text-xs text-muted-foreground">
									<tr>
										<th className="px-2 py-1.5" />
										<th className="px-2 py-1.5">
											<Trans>Day</Trans>
										</th>
										<th className="px-2 py-1.5">
											<Trans>Task</Trans>
										</th>
										<th className="px-2 py-1.5">
											<Trans>Start</Trans>
										</th>
										<th className="px-2 py-1.5">
											<Trans>Duration</Trans>
										</th>
										<th className="px-2 py-1.5" />
									</tr>
								</thead>
								<tbody>
									{proposal.entries.map((entry) => {
										const draft = drafts[entry.id];
										const task = tasks.get(entry.key);
										const result = results.get(entry.id);
										return (
											<tr key={entry.id} className="border-t">
												<td className="px-2 py-1">
													<input
														type="checkbox"
														aria-label={t({ message: "Include" })}
														checked={draft?.include ?? false}
														onChange={(e) =>
															patch(entry.id, { include: e.target.checked })
														}
													/>
												</td>
												<td className="whitespace-nowrap px-2 py-1">
													{dayLabel(entry.date)}
												</td>
												<td className="max-w-64 px-2 py-1">
													<span className="font-mono text-xs">{entry.key}</span>{" "}
													{task?.state === "in_progress" && (
														<span className="rounded bg-sky-500/15 px-1 text-[10px] text-sky-600 dark:text-sky-400">
															<Trans>in progress</Trans>
														</span>
													)}
													<span className="block truncate text-xs text-muted-foreground">
														{task?.summary}
													</span>
												</td>
												<td className="px-2 py-1">
													<Input
														type="time"
														className="h-8 w-28"
														value={draft?.time ?? entry.time}
														onChange={(e) =>
															patch(entry.id, { time: e.target.value })
														}
													/>
												</td>
												<td className="px-2 py-1">
													<Input
														className={cn(
															"h-8 w-24",
															draft &&
																!parseForkDuration(draft.duration) &&
																"border-destructive",
														)}
														value={draft?.duration ?? ""}
														onChange={(e) =>
															patch(entry.id, { duration: e.target.value })
														}
													/>
												</td>
												<td className="px-2 py-1 text-xs">
													{result?.ok && (
														<span className="text-emerald-600 dark:text-emerald-400">
															<Trans>Logged</Trans>
														</span>
													)}
													{result && !result.ok && (
														<span className="text-destructive">
															{result.error}
														</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
					{proposal.entries.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<Button
								size="sm"
								disabled={
									!proposal.valid ||
									invalid ||
									selected.length === 0 ||
									post.isPending
								}
								onClick={() => post.mutate()}
							>
								<Trans>Register on Jira</Trans>
							</Button>
							<span className="text-xs text-muted-foreground">
								<Trans>
									{selectedCount} entries · {selectedDuration}
								</Trans>
							</span>
							{post.error && (
								<span role="alert" className="text-xs text-destructive">
									{post.error.message}
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
