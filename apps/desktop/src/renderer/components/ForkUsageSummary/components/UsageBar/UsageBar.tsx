import { cn } from "@superset/ui/utils";
import { usageTone } from "../../utils/parseUsageWindow";

const FILL_CLASS = {
	ok: "bg-primary",
	warning: "bg-amber-500",
	danger: "bg-red-500",
} as const;

export function UsageBar({
	usedPercent,
	label,
	dimmed = false,
	className,
}: {
	usedPercent: number;
	label: string;
	dimmed?: boolean;
	className?: string;
}) {
	const percent = Number.isFinite(usedPercent)
		? Math.min(100, Math.max(0, usedPercent))
		: 0;
	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(percent)}
			className={cn(
				"h-1.5 overflow-hidden rounded-full bg-muted",
				dimmed && "opacity-60",
				className,
			)}
		>
			<div
				className={cn(
					"h-full rounded-full transition-[width]",
					FILL_CLASS[usageTone(percent)],
				)}
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}
