import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { forkAccountInitials } from "./forkAccountInitials";
import { quotaTone } from "./quotaTone";

const TONE_STROKE = {
	ok: "stroke-success",
	warning: "stroke-warning",
	danger: "stroke-destructive",
} as const;

export function ForkAccountAvatar({
	label,
	fiveHourUsed,
	weeklyUsed,
	className,
}: {
	label: string | null;
	fiveHourUsed: number | null;
	weeklyUsed: number | null;
	className?: string;
}) {
	const { t } = useLingui();
	const amount = (used: number | null) =>
		used === null
			? "—"
			: formatPercent(used / 100, { maximumFractionDigits: 0 });
	const fiveHour = amount(fiveHourUsed);
	const weekly = amount(weeklyUsed);
	const description = t({
		message: `Quota used · outer ring 5h: ${fiveHour} · inner ring weekly: ${weekly}`,
	});
	return (
		<span
			role="img"
			aria-label={description}
			title={description}
			className={cn(
				"relative grid size-6 shrink-0 place-items-center",
				className,
			)}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 size-full -rotate-90"
				viewBox="0 0 24 24"
			>
				{[
					{ id: "5h", radius: 10.5, used: fiveHourUsed },
					{ id: "weekly", radius: 7.7, used: weeklyUsed },
				].map(({ id, radius, used }) => {
					const circumference = 2 * Math.PI * radius;
					const fraction =
						used === null ? null : Math.min(100, Math.max(0, used)) / 100;
					return (
						<g key={id} data-quota-window={id}>
							<circle
								className="stroke-foreground/15"
								cx="12"
								cy="12"
								r={radius}
								fill="none"
								strokeWidth="1.5"
								strokeDasharray={fraction === null ? "1.5 2" : undefined}
							/>
							{fraction !== null && (
								<circle
									className={TONE_STROKE[quotaTone(100 - fraction * 100)]}
									cx="12"
									cy="12"
									r={radius}
									fill="none"
									strokeWidth="1.5"
									strokeDasharray={circumference}
									strokeDashoffset={circumference * (1 - fraction)}
									strokeLinecap="round"
								/>
							)}
						</g>
					);
				})}
			</svg>
			<span className="text-[7px] font-semibold leading-none text-foreground">
				{label ? forkAccountInitials(label) : "?"}
			</span>
		</span>
	);
}
