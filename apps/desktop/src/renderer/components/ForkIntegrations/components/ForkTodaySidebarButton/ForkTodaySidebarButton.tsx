import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { LuSun } from "react-icons/lu";

export function ForkTodaySidebarButton({
	variant,
}: {
	variant: "icon" | "row";
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const open = !!matchRoute({ to: "/today", fuzzy: true });
	const onClick = () => void navigate({ to: "/today" });
	if (variant === "icon")
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClick}
						aria-label={t({ message: "Today" })}
						aria-current={open ? "page" : undefined}
						className={cn(
							"flex size-7 items-center justify-center rounded-md transition-colors",
							open
								? "bg-fill-selected text-muted-foreground"
								: "text-muted-foreground hover:bg-fill-hover",
						)}
					>
						<LuSun className="size-3.5" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					<Trans>Today</Trans>
				</TooltipContent>
			</Tooltip>
		);
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={open ? "page" : undefined}
			className={cn(
				"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
				open
					? "bg-fill-selected text-foreground"
					: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
			)}
		>
			<LuSun
				className="size-4 shrink-0 text-muted-foreground"
				strokeWidth={1.5}
			/>
			<span className="flex-1 text-left">
				<Trans>Today</Trans>
			</span>
		</button>
	);
}
