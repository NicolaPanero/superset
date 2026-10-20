import { cn } from "@superset/ui/utils";

export function ForkUserAvatar({
	name,
	src,
	className,
}: {
	name: string;
	src?: string | null;
	className?: string;
}) {
	const initials = name
		.split(/\s+/)
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return src ? (
		<img
			alt=""
			src={src}
			className={cn(
				"size-5 shrink-0 rounded-full ring-1 ring-border/50",
				className,
			)}
		/>
	) : (
		<span
			aria-hidden
			className={cn(
				"flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-foreground ring-1 ring-border/50",
				className,
			)}
		>
			{initials || "?"}
		</span>
	);
}
