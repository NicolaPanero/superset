export const FORK_PRODUCT_NAME = "Superset++";
export const FORK_DISPLAY_NAME = "Paradev++";

export function forkAppDisplayName(
	appName: string,
	forkBuild = false,
): string | undefined {
	if (appName.startsWith(FORK_DISPLAY_NAME)) return appName;
	if (appName.startsWith(FORK_PRODUCT_NAME))
		return FORK_DISPLAY_NAME + appName.slice(FORK_PRODUCT_NAME.length);
	if (forkBuild && appName.startsWith("Superset"))
		return FORK_DISPLAY_NAME + appName.slice("Superset".length);
	return undefined;
}
