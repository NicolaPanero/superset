import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { ForkAgentCliUpdatesSettings } from "renderer/components/ForkAgentCliUpdates";
import { ForkCliOptionsSetting } from "renderer/components/ForkCliOptionsSetting";
import { ForkIntegrations } from "renderer/components/ForkIntegrations";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { useForkHomeAppearance } from "renderer/stores/fork-home-appearance";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { SettingsSection } from "../../../components/SettingsSection";
import {
	getMatchingItemsForSection,
	SETTING_ITEM_ID,
} from "../../../utils/settings-search";
import { ForkAttachmentRetention } from "./components/ForkAttachmentRetention";
import { ForkMcpServers } from "./components/ForkMcpServers";

export function ForkSettings() {
	const { t } = useLingui();
	const { hideProFeatures, setHideProFeatures, showToday, setShowToday } =
		useForkCliOptionsStore();
	const { interactiveBackground, setInteractiveBackground } =
		useForkHomeAppearance();
	const query = useSettingsSearchQuery();
	const matches = getMatchingItemsForSection(query, "fork");
	const showInterface = matches.some(
		(item) =>
			item.id === SETTING_ITEM_ID.FORK_TODAY ||
			item.id === SETTING_ITEM_ID.FORK_HIDE_CLI ||
			item.id === SETTING_ITEM_ID.FORK_HIDE_PRO ||
			item.id === SETTING_ITEM_ID.FORK_HOME_BACKGROUND,
	);
	return (
		<div className="p-6 max-w-4xl w-full space-y-8">
			<div>
				<h2 className="text-xl font-semibold">
					<Trans>Fork Settings</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>Options and connections that only exist in this fork.</Trans>
				</p>
			</div>
			{showInterface && (
				<SettingsSection title={t({ message: "Interface" })}>
					<div className="divide-y rounded-lg border">
						{matches.some((item) => item.id === SETTING_ITEM_ID.FORK_TODAY) && (
							<div className="flex items-center justify-between gap-6 px-5 py-4">
								<div className="space-y-1">
									<Label htmlFor="fork-show-today">
										<Trans>Show Today</Trans>
									</Label>
									<p className="text-xs text-muted-foreground">
										<Trans>Show the Today page in the sidebar.</Trans>
									</p>
								</div>
								<Switch
									id="fork-show-today"
									checked={showToday}
									onCheckedChange={setShowToday}
								/>
							</div>
						)}
						{matches.some(
							(item) => item.id === SETTING_ITEM_ID.FORK_HIDE_CLI,
						) && <ForkCliOptionsSetting />}
						{matches.some(
							(item) => item.id === SETTING_ITEM_ID.FORK_HIDE_PRO,
						) && (
							<div className="flex items-center justify-between gap-6 px-5 py-4">
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
						{matches.some(
							(item) => item.id === SETTING_ITEM_ID.FORK_HOME_BACKGROUND,
						) && (
							<div className="flex items-center justify-between gap-6 px-5 py-4">
								<div className="space-y-1">
									<Label htmlFor="fork-home-background">
										<Trans>Interactive home background</Trans>
									</Label>
									<p
										id="fork-home-background-description"
										className="text-xs text-muted-foreground"
									>
										<Trans>
											Show a character-based Superset logo and waves that
											respond to clicks.
										</Trans>
									</p>
								</div>
								<Switch
									id="fork-home-background"
									aria-describedby="fork-home-background-description"
									checked={interactiveBackground}
									onCheckedChange={setInteractiveBackground}
								/>
							</div>
						)}
					</div>
				</SettingsSection>
			)}
			{matches.some(
				(item) => item.id === SETTING_ITEM_ID.FORK_ATTACHMENT_RETENTION,
			) && (
				<SettingsSection title={t({ message: "Storage" })}>
					<div className="rounded-lg border">
						<ForkAttachmentRetention />
					</div>
				</SettingsSection>
			)}
			{matches.some(
				(item) => item.id === SETTING_ITEM_ID.FORK_AGENT_CLI_UPDATES,
			) && (
				<SettingsSection title={t({ message: "Agent updates" })}>
					<ForkAgentCliUpdatesSettings />
				</SettingsSection>
			)}
			{matches.some((item) => item.id === "fork-connections") && (
				<ForkIntegrations />
			)}
			{matches.some((item) => item.id === SETTING_ITEM_ID.FORK_MCP_SERVERS) && (
				<ForkMcpServers />
			)}
		</div>
	);
}
