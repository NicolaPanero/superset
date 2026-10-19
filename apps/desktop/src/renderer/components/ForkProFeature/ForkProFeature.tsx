import type { ReactNode } from "react";
import { useForkProFeatures } from "renderer/stores/fork-cli-options";

export function ForkProFeature({
	children,
	available = false,
}: {
	children: ReactNode;
	available?: boolean;
}) {
	return useForkProFeatures() || available ? children : null;
}
