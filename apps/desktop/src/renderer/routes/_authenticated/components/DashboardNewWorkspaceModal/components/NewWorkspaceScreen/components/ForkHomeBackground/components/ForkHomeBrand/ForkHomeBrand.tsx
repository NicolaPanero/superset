import type { ReactNode } from "react";
import { useForkHomeAppearance } from "renderer/stores/fork-home-appearance";

export function ForkHomeBrand({ children }: { children: ReactNode }) {
	const enabled = useForkHomeAppearance((state) => state.interactiveBackground);

	return enabled ? (
		<canvas
			width={320}
			height={200}
			className="fork-home-brand"
			role="img"
			aria-label="Superset++"
		/>
	) : (
		children
	);
}
