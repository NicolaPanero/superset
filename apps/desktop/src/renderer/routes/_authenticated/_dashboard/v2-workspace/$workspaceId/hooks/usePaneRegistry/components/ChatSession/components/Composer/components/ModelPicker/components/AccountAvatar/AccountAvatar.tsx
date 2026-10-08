import { cn } from "@superset/ui/utils";

const PALETTE = [
	"bg-orange-500/15 text-orange-600 dark:text-orange-300",
	"bg-sky-500/15 text-sky-600 dark:text-sky-300",
	"bg-violet-500/15 text-violet-600 dark:text-violet-300",
	"bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
	"bg-rose-500/15 text-rose-600 dark:text-rose-300",
	"bg-amber-500/15 text-amber-700 dark:text-amber-300",
];

function initials(name: string) {
	const words = name
		.split("@")[0]
		?.split(/[\s._-]+/)
		.filter(Boolean) ?? [name];
	const letters =
		words.length > 1
			? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
			: (words[0]?.slice(0, 2) ?? "");
	return letters.toUpperCase() || "?";
}

function colorFor(key: string) {
	let hash = 0;
	for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function AccountAvatar({
	name,
	colorKey,
	className,
}: {
	name: string;
	colorKey: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid shrink-0 place-items-center rounded-full font-semibold leading-none",
				colorFor(colorKey),
				className,
			)}
		>
			{initials(name)}
		</span>
	);
}
