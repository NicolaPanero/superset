import { afterEach, expect, test } from "bun:test";
import { useForkWorkspacesDeviceFilter } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useForkWorkspacesDeviceFilter";
import {
	DEVICE_FILTER_ALL_DEVICES,
	DEVICE_FILTER_THIS_DEVICE,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { HostSelect } from "renderer/routes/_authenticated/settings/components/HostSelect";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { act, render, renderHook } from "renderer/test-utils/fork-ui";
import { useForkHostId } from "./fork-host-visibility";

const originalFlags = useForkCliOptionsStore.getState();
const originalFilter = useV2WorkspacesFilterStore.getState().deviceFilter;

afterEach(() => {
	act(() => {
		useForkCliOptionsStore.setState(originalFlags);
		useV2WorkspacesFilterStore.setState({ deviceFilter: originalFilter });
	});
});

test("hidden device controls use local targets even with remembered remote or all-device filters", () => {
	useForkCliOptionsStore.setState({ hideProFeatures: true });
	useV2WorkspacesFilterStore.setState({ deviceFilter: "remote-host" });
	const { result } = renderHook(() => ({
		hostId: useForkHostId("remote-host"),
		deviceFilter: useForkWorkspacesDeviceFilter(),
	}));
	expect(result.current).toEqual({
		hostId: null,
		deviceFilter: DEVICE_FILTER_THIS_DEVICE,
	});
	act(() =>
		useV2WorkspacesFilterStore.setState({
			deviceFilter: DEVICE_FILTER_ALL_DEVICES,
		}),
	);
	expect(result.current.deviceFilter).toBe(DEVICE_FILTER_THIS_DEVICE);
	act(() => useForkCliOptionsStore.setState({ hideProFeatures: false }));
	expect(result.current).toEqual({
		hostId: "remote-host",
		deviceFilter: DEVICE_FILTER_ALL_DEVICES,
	});
});

test("the shared settings device selector follows the Fork Settings flag live", () => {
	useForkCliOptionsStore.setState({ hideProFeatures: true });
	const view = render(
		<HostSelect
			value="local-host"
			options={[
				{
					id: "local-host",
					name: "My computer",
					isLocal: true,
					isOnline: true,
				},
				{ id: "remote-host", name: "Server", isLocal: false, isOnline: true },
			]}
			onValueChange={() => {}}
		/>,
	);
	expect(view.queryByRole("combobox")).toBeNull();
	act(() => useForkCliOptionsStore.setState({ hideProFeatures: false }));
	expect(view.queryByRole("combobox")).not.toBeNull();
	act(() => useForkCliOptionsStore.setState({ hideProFeatures: true }));
	expect(view.queryByRole("combobox")).toBeNull();
});
