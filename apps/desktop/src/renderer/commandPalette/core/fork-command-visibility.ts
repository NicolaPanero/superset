import { isForkProRoute } from "renderer/lib/fork-settings-visibility";

export function isForkProCommand(id: string): boolean {
	return (
		id.startsWith("settings.") &&
		isForkProRoute(`/settings/${id.slice("settings.".length)}`)
	);
}
