import type { Plan } from "@superset/chat/protocol";
import { ForkPlanCard } from "../ForkPlanCard";

export function PlanRow({ item }: { item: Plan }) {
	return <ForkPlanCard item={item} />;
}
