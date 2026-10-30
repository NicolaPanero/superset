import { createFileRoute } from "@tanstack/react-router";
import { ForkTodayGate } from "renderer/components/ForkIntegrations/components/ForkToday/components/ForkTodayGate";

export const Route = createFileRoute("/_authenticated/_dashboard/today/")({
	component: ForkTodayGate,
});
