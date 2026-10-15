import type { ReactNode } from "react";
import { useForkProFeatures } from "renderer/stores/fork-cli-options";

export function ForkProFeature({ children }: { children: ReactNode }) {
	return useForkProFeatures() ? children : null;
}
