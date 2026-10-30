import { cn } from "@superset/ui/utils";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

export function ForkJiraSettingsPanel({
	icon: Icon,
	title,
	description,
	open,
	onOpenChange,
	children,
}: {
	icon: LucideIcon;
	title: ReactNode;
	description: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section className="@container/jira-settings mt-3 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background sm:ml-13">
			<button
				type="button"
				className="flex w-full items-center gap-3.5 p-4 text-left transition-colors hover:bg-muted/30"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => onOpenChange(!open)}
			>
				<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
					<Icon className="size-5" aria-hidden />
				</span>
				<span className="min-w-0 flex-1 space-y-1">
					<span className="block text-sm font-semibold">{title}</span>
					<span className="block text-xs leading-relaxed text-muted-foreground">
						{description}
					</span>
				</span>
				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden
				/>
			</button>
			{open && (
				<div id={id} className="border-t border-border/70">
					{children}
				</div>
			)}
		</section>
	);
}
