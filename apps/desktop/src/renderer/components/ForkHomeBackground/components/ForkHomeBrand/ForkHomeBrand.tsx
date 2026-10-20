import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useForkHomeAppearance } from "renderer/stores/fork-home-appearance";
import { supportsForkHomeScene } from "../../fork-home-support";

export function ForkHomeBrand({
	children,
	compact = false,
}: {
	children: ReactNode;
	compact?: boolean;
}) {
	const enabled = useForkHomeAppearance((state) => state.interactiveBackground);

	return enabled && supportsForkHomeScene() ? (
		<div
			className={cn("fork-home-brand", compact && "fork-home-brand--compact")}
			role="img"
			aria-label="Superset++"
		/>
	) : (
		children
	);
}
