import { useForkProFeatures } from "renderer/stores/fork-cli-options";
import {
	DEVICE_FILTER_THIS_DEVICE,
	useV2WorkspacesFilterStore,
} from "../../stores/v2WorkspacesFilterStore";

export function useForkWorkspacesDeviceFilter() {
	const showProFeatures = useForkProFeatures();
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	return showProFeatures ? deviceFilter : DEVICE_FILTER_THIS_DEVICE;
}
