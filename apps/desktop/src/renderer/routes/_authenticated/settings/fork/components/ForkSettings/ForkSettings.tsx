import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { ForkCliOptionsSetting } from "renderer/components/ForkCliOptionsSetting";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	getMatchingItemsForSection,
	SETTING_ITEM_ID,
} from "../../../utils/settings-search";

export function ForkSettings() {
	const { hideProFeatures, setHideProFeatures } = useForkCliOptionsStore();
	const query = useSettingsSearchQuery();
	const matches = getMatchingItemsForSection(query, "fork");
	return (
		<div className="p-6 space-y-6">
			<h2 className="text-xl font-semibold">
				<Trans>Fork Settings</Trans>
			</h2>
			<div className="rounded-lg border border-border overflow-hidden">
				{matches.some((item) => item.id === SETTING_ITEM_ID.FORK_HIDE_CLI) && (
					<ForkCliOptionsSetting />
				)}
				{matches.some((item) => item.id === SETTING_ITEM_ID.FORK_HIDE_PRO) && (
					<div className="flex items-center justify-between gap-4 border-t px-6 py-4">
						<div className="space-y-1">
							<Label htmlFor="fork-hide-pro">
								<Trans>Hide Pro features</Trans>
							</Label>
							<p
								id="fork-hide-pro-description"
								className="text-xs text-muted-foreground"
							>
								<Trans>
									Hide paid features and upgrade prompts on this device.
								</Trans>
							</p>
						</div>
						<Switch
							id="fork-hide-pro"
							aria-describedby="fork-hide-pro-description"
							checked={hideProFeatures}
							onCheckedChange={setHideProFeatures}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
