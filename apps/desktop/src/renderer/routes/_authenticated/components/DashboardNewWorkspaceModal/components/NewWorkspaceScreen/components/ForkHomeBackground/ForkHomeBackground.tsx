import { useEffect, useRef } from "react";
import { useForkHomeAppearance } from "renderer/stores/fork-home-appearance";
import "./fork-home-background.css";

export function ForkHomeBackground({ active }: { active: boolean }) {
	const enabled = useForkHomeAppearance((state) => state.interactiveBackground);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!enabled || !active || !canvas) return;
		let disposed = false;
		let dispose: (() => void) | undefined;
		void import("./fork-home-scene").then(({ mountForkHomeScene }) => {
			if (!disposed) dispose = mountForkHomeScene(canvas);
		});
		return () => {
			disposed = true;
			dispose?.();
		};
	}, [enabled, active]);

	return enabled && active ? (
		<canvas
			ref={canvasRef}
			className="fork-home-background"
			tabIndex={-1}
			aria-hidden="true"
		/>
	) : null;
}
