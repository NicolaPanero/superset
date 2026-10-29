import { createFileRoute } from "@tanstack/react-router";
import { ForkToday } from "renderer/components/ForkIntegrations/components/ForkToday";

export const Route = createFileRoute("/_authenticated/_dashboard/today/")({
	component: ForkToday,
});
