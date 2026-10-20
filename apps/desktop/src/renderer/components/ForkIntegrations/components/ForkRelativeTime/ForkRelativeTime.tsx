import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";

export function ForkRelativeTime({ value }: { value: string | undefined }) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return null;
	return (
		<time dateTime={value} title={formatDateTime(date)} className="shrink-0">
			{formatRelativeTime(date)}
		</time>
	);
}
