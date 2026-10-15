import { createFileRoute } from "@tanstack/react-router";
import { ForkSettings } from "./components/ForkSettings";

export const Route = createFileRoute("/_authenticated/settings/fork/")({
	component: ForkSettings,
});
