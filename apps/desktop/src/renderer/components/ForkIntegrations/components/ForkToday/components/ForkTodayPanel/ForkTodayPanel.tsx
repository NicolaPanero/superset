import { cn } from "@superset/ui/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
export function ForkTodayPanel({
	title,
	description,
	icon: Icon,
	actions,
	children,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	icon: LucideIcon;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"min-w-0 overflow-clip rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xs",
				className,
			)}
		>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4 @min-[640px]/today:p-5">
				<div className="flex min-w-0 flex-1 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
						<Icon className="size-4" aria-hidden />
					</span>
					<div className="min-w-0 space-y-1">
						<h2 className="text-sm font-semibold leading-6">{title}</h2>
						{description && (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{description}
							</p>
						)}
					</div>
				</div>
				{actions}
			</header>
			{children}
		</section>
	);
}
