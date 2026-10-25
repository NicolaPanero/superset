import { useForkProFeatures } from "renderer/stores/fork-cli-options";
import {
	useV2WorkspacesFilterStore,
	WHERE_FILTER_THIS_DEVICE,
} from "../../stores/v2WorkspacesFilterStore";

export function useForkWorkspacesDeviceFilter() {
	const showProFeatures = useForkProFeatures();
	const whereFilter = useV2WorkspacesFilterStore((state) => state.whereFilter);
	return showProFeatures ? whereFilter : WHERE_FILTER_THIS_DEVICE;
}
