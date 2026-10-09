import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState, useSyncExternalStore } from "react";
import { ForkUsageSummary } from "../ForkUsageSummary";
import {
	accountLaunchSnapshot,
	refreshAccountLaunch,
	subscribeAccountLaunch,
} from "./accountLaunch";

export function ForkAccountLaunchDialog() {
	const { t } = useLingui();
	const prompt = useSyncExternalStore(
		subscribeAccountLaunch,
		accountLaunchSnapshot,
	);
	const [refreshing, setRefreshing] = useState(false);
	return (
		<AlertDialog
			open={!!prompt}
			onOpenChange={(open) => {
				if (!open) prompt?.resolve(false);
			}}
		>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Check account before starting</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							This account may incur charges or its available quota cannot be
							verified. Choose another account, refresh usage, or continue for
							this launch.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				{prompt && (
					<>
						<div className="text-sm font-medium">
							{prompt.account?.email ?? prompt.request.provider}
						</div>
						{prompt.forcedApi ? (
							<div className="text-amber-500">
								<Trans>API billing</Trans>
							</div>
						) : (
							<ForkUsageSummary
								account={prompt.account}
								model={prompt.request.model}
							/>
						)}
					</>
				)}
				<AlertDialogFooter className="flex-wrap">
					<Button
						variant="outline"
						onClick={() => {
							prompt?.resolve(false);
							prompt?.request.chooseOther?.();
						}}
					>
						<Trans>Choose another account</Trans>
					</Button>
					<Button
						variant="outline"
						disabled={refreshing}
						onClick={async () => {
							if (!prompt) return;
							setRefreshing(true);
							try {
								await refreshAccountLaunch(prompt);
							} catch (error) {
								toast.error(t({ message: "Usage unavailable." }), {
									description: errorMessage(error),
								});
							} finally {
								setRefreshing(false);
							}
						}}
					>
						<Trans>Refresh</Trans>
					</Button>
					<Button disabled={refreshing} onClick={() => prompt?.resolve(true)}>
						<Trans>Start anyway</Trans>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
