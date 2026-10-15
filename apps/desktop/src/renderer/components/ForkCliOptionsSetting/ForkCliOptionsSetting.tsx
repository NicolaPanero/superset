import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";

export function ForkCliOptionsSetting() {
	const { hideCliOptions, setHideCliOptions } = useForkCliOptionsStore();
	return (
		<div className="flex items-center justify-between gap-4 border-t px-6 py-4">
			<div className="space-y-1">
				<Label htmlFor="fork-cli-options">
					<Trans>Hide CLI options</Trans>
				</Label>
				<p
					id="fork-cli-options-description"
					className="text-xs text-muted-foreground"
				>
					<Trans>
						Hide CLI login accounts and the CHAT/CLI switch. Run workspace setup
						in the background.
					</Trans>
				</p>
			</div>
			<Switch
				id="fork-cli-options"
				aria-describedby="fork-cli-options-description"
				checked={hideCliOptions}
				onCheckedChange={setHideCliOptions}
			/>
		</div>
	);
}
