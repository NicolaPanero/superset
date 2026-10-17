import { useForkAvailability } from "../../hooks/useForkAvailability";
import { ForkServiceNotice } from "../ForkServiceNotice";

export function ForkServiceNotices({
	hidden = false,
	sidebar = true,
}: {
	hidden?: boolean;
	sidebar?: boolean;
}) {
	const availability = useForkAvailability();
	const providers = [
		...new Set(
			(availability.data ?? [])
				.filter((status) => status.provider !== "github")
				.map((status) => status.provider),
		),
	];
	if (hidden) return null;
	return providers.map((provider) => (
		<ForkServiceNotice key={provider} provider={provider} sidebar={sidebar} />
	));
}
