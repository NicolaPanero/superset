import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useForkProFeatures } from "renderer/stores/fork-cli-options";
import { ForkTasksBoundary } from "../ForkTasksBoundary/ForkTasksBoundary";
export function ForkTaskRouteGate({ children }: { children: ReactNode }) {
	const showPro = useForkProFeatures(),
		location = useLocation();
	return !showPro && location.pathname.replace(/\/$/, "") !== "/tasks" ? (
		<ForkTasksBoundary>{null}</ForkTasksBoundary>
	) : (
		children
	);
}
