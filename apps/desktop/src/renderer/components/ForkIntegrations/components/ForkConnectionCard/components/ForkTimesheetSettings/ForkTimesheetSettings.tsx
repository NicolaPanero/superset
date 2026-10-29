import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

type Settings = Awaited<
	ReturnType<
		NonNullable<
			ReturnType<typeof useForkConnections>["client"]
		>["forkTasks"]["timesheetSettings"]["query"]
	>
>;

const EXAMPLE_PROJECT = "APP";
const EXAMPLE_FIELD = "customfield_10000";

const parseVacations = (text: string) =>
	text
		.split(/\n|,/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [from = "", to = from] = line.split(":").map((part) => part.trim());
			return { from, to };
		})
		.filter(
			(range) =>
				/^\d{4}-\d{2}-\d{2}$/.test(range.from) &&
				/^\d{4}-\d{2}-\d{2}$/.test(range.to),
		);

export function ForkTimesheetSettings({
	connectionId,
}: {
	connectionId: string;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<Settings | null>(null);
	const [vacations, setVacations] = useState("");
	const [modules, setModules] = useState("");
	const query = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"timesheet-settings",
			connectionId,
		],
		queryFn: () =>
			required(client).forkTasks.timesheetSettings.query({ connectionId }),
		enabled: !!client && open,
		retry: false,
	});
	useEffect(() => {
		if (!query.data) return;
		setDraft(query.data);
		setVacations(
			query.data.vacations
				.map((range) =>
					range.from === range.to ? range.from : `${range.from}:${range.to}`,
				)
				.join("\n"),
		);
		setModules(query.data.modules.join(", "));
	}, [query.data]);
	const save = useMutation({
		mutationFn: (settings: Settings) =>
			required(client).forkTasks.timesheetSaveSettings.mutate({
				connectionId,
				settings,
			}),
		onSuccess: () => {
			toast.success(t({ message: "Saved" }));
			void query.refetch();
		},
	});
	if (!open)
		return (
			<Button
				size="xs"
				variant="ghost"
				className="mt-1 sm:ml-13"
				onClick={() => setOpen(true)}
			>
				<Trans>Timesheet proposals</Trans>
			</Button>
		);
	const set = (patch: Partial<Settings>) =>
		setDraft((current) => (current ? { ...current, ...patch } : current));
	const timeZone = draft?.timeZone ?? "";
	const number = (value: string, fallback: number) =>
		Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback;
	return (
		<div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4 text-sm sm:ml-13">
			<label className="flex items-start gap-2">
				<input
					type="checkbox"
					className="mt-1"
					checked={draft?.enabled ?? false}
					disabled={!draft}
					onChange={(e) => set({ enabled: e.target.checked })}
				/>
				<span>
					<span className="font-medium">
						<Trans>Propose hours for my timesheet</Trans>
					</span>
					<span className="block text-xs text-muted-foreground">
						<Trans>
							Off by default. When on, the Today view can prepare, only when you
							ask, a proposal of worklogs for working days below the minimum.
							Nothing is logged without your confirmation and no automation can
							prepare or send it.
						</Trans>
					</span>
				</span>
			</label>
			{draft?.enabled && (
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="ts-project">
							<Trans>Jira project key</Trans>
						</Label>
						<Input
							id="ts-project"
							placeholder={EXAMPLE_PROJECT}
							value={draft.project}
							onChange={(e) => set({ project: e.target.value })}
						/>
					</div>
					<label className="flex items-center gap-2 self-end text-xs">
						<input
							type="checkbox"
							checked={draft.includeInProgress}
							onChange={(e) => set({ includeInProgress: e.target.checked })}
						/>
						<Trans>Include tasks still in progress</Trans>
					</label>
					<div className="space-y-1">
						<Label htmlFor="ts-module-field">
							<Trans>Module field (optional)</Trans>
						</Label>
						<Input
							id="ts-module-field"
							placeholder={EXAMPLE_FIELD}
							value={draft.moduleField}
							onChange={(e) => set({ moduleField: e.target.value })}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="ts-modules">
							<Trans>Modules (comma separated)</Trans>
						</Label>
						<Input
							id="ts-modules"
							value={modules}
							onChange={(e) => setModules(e.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="ts-min">
							<Trans>Minimum hours a day</Trans>
						</Label>
						<Input
							id="ts-min"
							type="number"
							step="0.5"
							value={draft.minHours}
							onChange={(e) => set({ minHours: number(e.target.value, 6) })}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="ts-max">
							<Trans>Maximum hours a day</Trans>
						</Label>
						<Input
							id="ts-max"
							type="number"
							step="0.5"
							value={draft.maxHours}
							onChange={(e) => set({ maxHours: number(e.target.value, 8) })}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="ts-step">
							<Trans>Step</Trans>
						</Label>
						<select
							id="ts-step"
							className="h-9 w-full rounded-md border bg-background px-2 text-sm"
							value={draft.stepMinutes}
							onChange={(e) =>
								set({
									stepMinutes:
										e.target.value === "15"
											? 15
											: e.target.value === "60"
												? 60
												: 30,
								})
							}
						>
							<option value="15">15m</option>
							<option value="30">30m</option>
							<option value="60">1h</option>
						</select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="ts-holidays">
							<Trans>Public holidays</Trans>
						</Label>
						<select
							id="ts-holidays"
							className="h-9 w-full rounded-md border bg-background px-2 text-sm"
							value={draft.holidays}
							onChange={(e) =>
								set({ holidays: e.target.value === "none" ? "none" : "IT" })
							}
						>
							<option value="IT">{t({ message: "Italy" })}</option>
							<option value="none">{t({ message: "None" })}</option>
						</select>
					</div>
					{(
						[
							["dayStart", <Trans key="s">Day starts</Trans>],
							["lunchStart", <Trans key="l">Lunch starts</Trans>],
							["lunchEnd", <Trans key="e">Lunch ends</Trans>],
							["dayEnd", <Trans key="d">Day ends</Trans>],
						] as const
					).map(([field, label]) => (
						<div key={field} className="space-y-1">
							<Label htmlFor={`ts-${field}`}>{label}</Label>
							<Input
								id={`ts-${field}`}
								type="time"
								value={draft[field]}
								onChange={(e) => set({ [field]: e.target.value })}
							/>
						</div>
					))}
					<div className="space-y-1 sm:col-span-2">
						<Label htmlFor="ts-vacations">
							<Trans>
								Days off (one per line, YYYY-MM-DD or YYYY-MM-DD:YYYY-MM-DD)
							</Trans>
						</Label>
						<Textarea
							id="ts-vacations"
							className="min-h-20 font-mono text-xs"
							value={vacations}
							onChange={(e) => setVacations(e.target.value)}
						/>
					</div>
					<p className="text-xs text-muted-foreground sm:col-span-2">
						<Trans>Time zone: {timeZone}</Trans>
					</p>
				</div>
			)}
			{(query.error || save.error) && (
				<p role="alert" className="text-xs text-destructive">
					{(query.error ?? save.error)?.message}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={!draft || save.isPending}
					onClick={() =>
						draft &&
						save.mutate({
							...draft,
							vacations: parseVacations(vacations),
							modules: modules
								.split(",")
								.map((value) => value.trim())
								.filter(Boolean),
						})
					}
				>
					<Trans>Save</Trans>
				</Button>
				<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
					<Trans>Close</Trans>
				</Button>
			</div>
		</div>
	);
}
