import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import type { ForkAutomationSourceKind } from "../../utils/forkAutomationTemplates";

export interface ForkAutomationOptionsValue {
	sourceKind: ForkAutomationSourceKind;
	refire: "never" | "status_change";
	verifyCommand: string;
	retryLimit: number;
	targetLimit: number | null;
	catchupMinutes: number;
	days: number[];
	time: string;
	timeZone: string;
}

export const FORK_AUTOMATION_DEFAULT_OPTIONS: ForkAutomationOptionsValue = {
	sourceKind: "jira",
	refire: "never",
	verifyCommand: "",
	retryLimit: 3,
	targetLimit: null,
	catchupMinutes: 120,
	days: [1, 2, 3, 4, 5],
	time: "09:00",
	timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const DAYS = [
	msg({ message: "Mon" }),
	msg({ message: "Tue" }),
	msg({ message: "Wed" }),
	msg({ message: "Thu" }),
	msg({ message: "Fri" }),
	msg({ message: "Sat" }),
	msg({ message: "Sun" }),
];

export function ForkAutomationOptions({
	value,
	onChange,
}: {
	value: ForkAutomationOptionsValue;
	onChange: (patch: Partial<ForkAutomationOptionsValue>) => void;
}) {
	const { i18n } = useLingui();
	const timeZone = value.timeZone;
	const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
	return (
		<div className="space-y-3 rounded-lg border bg-muted/10 p-3">
			{value.sourceKind === "schedule" && (
				<div className="space-y-2">
					<Label>
						<Trans>Days</Trans>
					</Label>
					<div className="flex flex-wrap gap-1">
						{DAYS.map((label, index) => {
							const day = (index + 1) % 7;
							const on = value.days.includes(day);
							return (
								<button
									type="button"
									key={label.id}
									aria-pressed={on}
									onClick={() =>
										onChange({
											days: on
												? value.days.filter((d) => d !== day)
												: [...value.days, day].sort(),
										})
									}
									className={`rounded-md border px-2 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
								>
									{i18n._(label)}
								</button>
							);
						})}
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1">
							<Label htmlFor="fork-automation-time">
								<Trans>Time</Trans>
							</Label>
							<Input
								id="fork-automation-time"
								type="time"
								value={value.time}
								onChange={(e) => onChange({ time: e.target.value })}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="fork-automation-catchup">
								<Trans>Run late for up to (minutes)</Trans>
							</Label>
							<Input
								id="fork-automation-catchup"
								type="number"
								min={0}
								value={value.catchupMinutes}
								onChange={(e) =>
									onChange({ catchupMinutes: Number(e.target.value) || 0 })
								}
							/>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						<Trans>
							If the computer is off or asleep at the scheduled time, the run
							starts when it wakes within this window, otherwise it is skipped.
							Time zone: {timeZone}.
						</Trans>
					</p>
				</div>
			)}
			{value.sourceKind === "jira" && (
				<div className="space-y-1">
					<Label htmlFor="fork-automation-refire">
						<Trans>Run again on the same issue</Trans>
					</Label>
					<select
						id="fork-automation-refire"
						className={selectClass}
						value={value.refire}
						onChange={(e) =>
							onChange({
								refire:
									e.target.value === "status_change"
										? "status_change"
										: "never",
							})
						}
					>
						<option value="never">{i18n._(msg({ message: "Never" }))}</option>
						<option value="status_change">
							{i18n._(
								msg({
									message: "When its status changes and it still matches",
								}),
							)}
						</option>
					</select>
				</div>
			)}
			{(value.sourceKind === "pr_comments" ||
				value.sourceKind === "ci_failure") && (
				<div className="space-y-1">
					<Label htmlFor="fork-automation-target-limit">
						<Trans>Runs per pull request at most</Trans>
					</Label>
					<Input
						id="fork-automation-target-limit"
						type="number"
						min={1}
						max={50}
						value={value.targetLimit ?? ""}
						placeholder="∞"
						onChange={(e) =>
							onChange({
								targetLimit: e.target.value ? Number(e.target.value) : null,
							})
						}
					/>
				</div>
			)}
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1">
					<Label htmlFor="fork-automation-verify">
						<Trans>Check command (optional)</Trans>
					</Label>
					<Input
						id="fork-automation-verify"
						className="font-mono text-xs"
						placeholder="bun test"
						value={value.verifyCommand}
						onChange={(e) => onChange({ verifyCommand: e.target.value })}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="fork-automation-retry">
						<Trans>Launch attempts</Trans>
					</Label>
					<Input
						id="fork-automation-retry"
						type="number"
						min={1}
						max={5}
						value={value.retryLimit}
						onChange={(e) =>
							onChange({ retryLimit: Number(e.target.value) || 1 })
						}
					/>
				</div>
			</div>
			<p className="text-xs text-muted-foreground">
				<Trans>
					When the agent finishes, the check command runs in the workspace. Exit
					code 0 marks the run as verified. Without a command, you mark it
					yourself. A launch that fails is retried after 1, 5 and 15 minutes;
					three failures in a row pause the rule.
				</Trans>
			</p>
		</div>
	);
}
