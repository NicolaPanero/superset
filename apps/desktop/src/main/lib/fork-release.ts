export function newerForkRelease(
	installed: string,
	latest: string | undefined,
): string | null {
	return latest && latest !== installed && latest.startsWith("desktop-v")
		? latest
		: null;
}
