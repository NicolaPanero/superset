import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useSettings } from "renderer/stores/settings";

export function AcpChatSetting() {
	const acpChatEnabled = useSettings((state) => state.acpChatEnabled !== false);
	const updateSettings = useSettings((state) => state.update);
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="local-acp-chat" className="text-sm font-medium">
					<Trans>ACP chat</Trans>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Open new supported agents in a shared chat interface. Existing
						sessions keep their current view. The terminal remains available.
					</Trans>
				</p>
			</div>
			<Switch
				id="local-acp-chat"
				checked={acpChatEnabled}
				onCheckedChange={(enabled) => updateSettings("acpChatEnabled", enabled)}
			/>
		</div>
	);
}
