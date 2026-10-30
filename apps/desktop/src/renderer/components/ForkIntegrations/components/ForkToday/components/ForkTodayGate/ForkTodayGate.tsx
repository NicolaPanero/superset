import { Redirect } from "renderer/components/Redirect";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { ForkToday } from "../../ForkToday";
export function ForkTodayGate() {
	const show = useForkCliOptionsStore((s) => s.showToday);
	return show ? <ForkToday /> : <Redirect to="/new-workspace" replace />;
}
