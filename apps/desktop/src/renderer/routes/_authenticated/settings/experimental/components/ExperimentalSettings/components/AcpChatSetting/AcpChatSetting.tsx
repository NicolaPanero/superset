import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useAcpChatStore } from "renderer/stores/acp-chat";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";

export function AcpChatSetting() {
	const showCliOptions = useForkCliOptions();
	const acpChatEnabled = useAcpChatEnabled() === "enabled";
	const setAcpChatEnabled = useAcpChatStore((state) => state.setEnabled);
	if (!showCliOptions) return null;
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
				onCheckedChange={setAcpChatEnabled}
			/>
		</div>
	);
}
