import { useForkProFeatures } from "renderer/stores/fork-cli-options";

export function useForkHostId(hostId: string | null): string | null {
	return useForkProFeatures() ? hostId : null;
}
