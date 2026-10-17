import { cn } from "@superset/ui/utils";
import { type ComponentType, type ReactNode, useId } from "react";

export interface ForkSegment<T extends string> {
	value: T;
	label: ReactNode;
	icon?: ComponentType<{ className?: string }>;
	disabled?: boolean;
}

/**
 * One choice among a few. The chosen segment is raised; hovering the others
 * only brightens their text, so hover never looks like a selection.
 */
export function ForkSegmentedControl<T extends string>({
	value,
	segments,
	onChange,
	disabled = false,
	label,
	className,
}: {
	value: T;
	segments: ForkSegment<T>[];
	onChange: (value: T) => void;
	disabled?: boolean;
	label?: string;
	className?: string;
}) {
	const name = useId();
	return (
		<fieldset
			disabled={disabled}
			className={cn(
				"grid min-w-0 gap-0.5 rounded-lg border bg-muted/40 p-0.5",
				className,
			)}
			style={{
				gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`,
			}}
		>
			{label && <legend className="sr-only">{label}</legend>}
			{segments.map((segment) => {
				const selected = segment.value === value;
				const off = disabled || segment.disabled;
				const Icon = segment.icon;
				return (
					<label
						key={segment.value}
						className={cn(
							"flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors",
							"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
							off ? "cursor-not-allowed opacity-40" : "cursor-pointer",
							selected
								? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border"
								: !off && "text-muted-foreground hover:text-foreground",
						)}
					>
						<input
							type="radio"
							name={name}
							className="sr-only"
							checked={selected}
							disabled={off}
							onChange={() => onChange(segment.value)}
						/>
						{Icon && <Icon className="size-3.5 shrink-0" />}
						<span className="truncate">{segment.label}</span>
					</label>
				);
			})}
		</fieldset>
	);
}
