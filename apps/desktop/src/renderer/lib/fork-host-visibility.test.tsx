import { afterEach, expect, test } from "bun:test";
import { useForkWorkspacesDeviceFilter } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useForkWorkspacesDeviceFilter";
import {
	useV2WorkspacesFilterStore,
	WHERE_FILTER_ANYWHERE,
	WHERE_FILTER_THIS_DEVICE,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { HostSelect } from "renderer/routes/_authenticated/settings/components/HostSelect";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { act, render, renderHook } from "renderer/test-utils/fork-ui";
import { useForkHostId } from "./fork-host-visibility";

const originalFlags = useForkCliOptionsStore.getState();
const originalFilter = useV2WorkspacesFilterStore.getState().whereFilter;

afterEach(() => {
	act(() => {
		useForkCliOptionsStore.setState(originalFlags);
		useV2WorkspacesFilterStore.setState({ whereFilter: originalFilter });
	});
});

test("hidden device controls use local targets even with remembered remote or all-device filters", () => {
	useForkCliOptionsStore.setState({ hideProFeatures: true });
	useV2WorkspacesFilterStore.setState({ whereFilter: "remote-host" });
	const { result } = renderHook(() => ({
		hostId: useForkHostId("remote-host"),
		deviceFilter: useForkWorkspacesDeviceFilter(),
	}));
	expect(result.current).toEqual({
		hostId: null,
		deviceFilter: WHERE_FILTER_THIS_DEVICE,
	});
	act(() =>
		useV2WorkspacesFilterStore.setState({
			whereFilter: WHERE_FILTER_ANYWHERE,
		}),
	);
	expect(result.current.deviceFilter).toBe(WHERE_FILTER_THIS_DEVICE);
	act(() => useForkCliOptionsStore.setState({ hideProFeatures: false }));
	expect(result.current).toEqual({
		hostId: "remote-host",
		deviceFilter: WHERE_FILTER_ANYWHERE,
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
