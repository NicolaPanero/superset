import type { ReactNode } from "react";
import type { PullRequestInfoVariant } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestInfo";

export function ForkInfoSection({
	variant,
	label,
	icon,
	children,
}: {
	variant: PullRequestInfoVariant;
	label: string;
	icon?: ReactNode;
	children: ReactNode;
}) {
	if (variant === "rows")
		return (
			<div className="flex items-start gap-3 py-1.5 text-xs">
				<span className="flex h-6 w-24 shrink-0 items-center gap-2 text-muted-foreground @max-[30rem]/detail:w-20">
					{icon}
					{label}
				</span>
				<div className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-2 text-foreground">
					{children}
				</div>
			</div>
		);
	return (
		<section className="flex flex-col gap-2" aria-label={label}>
			<h2 className="m-0 flex h-6 items-center text-xs font-normal text-muted-foreground">
				{label}
			</h2>
			<div className="flex min-w-0 flex-col gap-2 text-xs">{children}</div>
		</section>
	);
}
