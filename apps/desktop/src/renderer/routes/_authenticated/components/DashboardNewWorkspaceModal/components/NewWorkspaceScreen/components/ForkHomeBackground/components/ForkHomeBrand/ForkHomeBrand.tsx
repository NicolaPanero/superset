import { type ReactNode, useEffect, useRef } from "react";
import { useForkHomeAppearance } from "renderer/stores/fork-home-appearance";
import { drawForkHomeLogo } from "./fork-home-logo";

export function ForkHomeBrand({ children }: { children: ReactNode }) {
	const enabled = useForkHomeAppearance((state) => state.interactiveBackground);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!enabled || !canvas) return;
		const draw = () => drawForkHomeLogo(canvas);
		draw();
		window.addEventListener("resize", draw);
		const observer = new MutationObserver(draw);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", draw);
		};
	}, [enabled]);

	return enabled ? (
		<canvas
			ref={canvasRef}
			className="fork-home-brand"
			role="img"
			aria-label="Superset++"
		/>
	) : (
		children
	);
}
