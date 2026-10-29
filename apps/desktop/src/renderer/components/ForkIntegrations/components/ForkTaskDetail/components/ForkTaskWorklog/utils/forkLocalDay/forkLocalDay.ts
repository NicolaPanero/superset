const pad = (value: number) => String(value).padStart(2, "0");

export function forkLocalDay(date = new Date()): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Current local time rounded down to a quarter hour, as HH:mm. */
export function forkLocalQuarter(date = new Date()): string {
	return `${pad(date.getHours())}:${pad(Math.floor(date.getMinutes() / 15) * 15)}`;
}

export function forkSystemTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
