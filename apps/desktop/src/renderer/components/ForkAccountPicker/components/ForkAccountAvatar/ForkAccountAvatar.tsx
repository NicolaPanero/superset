import { cn } from "@superset/ui/utils";
import { forkAccountInitials } from "./forkAccountInitials";
import { quotaTone } from "./quotaTone";

const TONE_STROKE = {
	ok: "stroke-success",
	warning: "stroke-warning",
	danger: "stroke-destructive",
} as const;

const RADIUS = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ForkAccountAvatar({
	label,
	remaining,
	className,
}: {
	label: string | null;
	remaining: number | null;
	className?: string;
}) {
	const fraction =
		remaining === null ? null : Math.min(Math.max(remaining, 0), 100) / 100;
	return (
		<span
			className={cn(
				"relative grid size-5 shrink-0 place-items-center",
				className,
			)}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 size-full -rotate-90"
				viewBox="0 0 20 20"
			>
				<circle
					className="stroke-foreground/15"
					cx="10"
					cy="10"
					fill="none"
					r={RADIUS}
					strokeWidth="1.6"
				/>
				{fraction !== null && (
					<circle
						className={TONE_STROKE[quotaTone(fraction * 100)]}
						cx="10"
						cy="10"
						fill="none"
						r={RADIUS}
						strokeDasharray={CIRCUMFERENCE}
						strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
						strokeLinecap="round"
						strokeWidth="1.6"
					/>
				)}
			</svg>
			<span className="text-[7.5px] font-semibold leading-none text-foreground">
				{label ? forkAccountInitials(label) : "?"}
			</span>
		</span>
	);
}
