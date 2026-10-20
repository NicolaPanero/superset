import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate, formatNumber } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { useForkAccountResets } from "./hooks/useForkAccountResets";

export function ForkAccountResets({
	hostUrl,
	account,
	hideEmail = false,
	useResets = useForkAccountResets,
}: {
	hostUrl: string | null;
	account: UsageAccount;
	hideEmail?: boolean;
	useResets?: typeof useForkAccountResets;
}) {
	const { t } = useLingui();
	const resets = useResets(hostUrl, account);
	const scope = JSON.stringify([
		hostUrl,
		account.agent,
		account.selection,
		account.email,
	]);
	const [confirmation, setConfirmation] = useState<{
		scope: string;
		identity: string;
		email: string;
		idempotencyKey: string;
		creditId?: string;
	} | null>(null);
	const [revealedAttempt, setRevealedAttempt] = useState<string | null>(null);
	const [notice, setNotice] = useState<{
		scope: string;
		kind: "success" | "none" | "error";
	} | null>(null);
	const data = resets.data?.email === account.email ? resets.data : undefined;
	const open =
		confirmation?.scope === scope &&
		(!data || confirmation.identity === data.identity);
	const ready =
		account.agent === "codex" &&
		resets.enabled &&
		!resets.isError &&
		data?.status === "ready" &&
		Date.now() - new Date(data.fetchedAt).getTime() < 360_000;
	const credits = data?.credits?.toSorted(
		(a, b) =>
			(a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity) -
			(b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity),
	);
	const credit = credits?.find(
		(row) => !row.expiresAt || new Date(row.expiresAt).getTime() > Date.now(),
	);
	const count = ready ? data.availableCount : null;
	const canUse =
		ready &&
		(!!data.pendingAttempt ||
			(count !== null && count > 0 && (data.credits == null || !!credit)));
	if (
		account.credentialKind !== "subscription" ||
		account.status === "signed_out" ||
		(account.agent !== "claude" && account.agent !== "codex")
	)
		return null;
	const external =
		account.agent === "claude" ||
		account.selection === null ||
		(!resets.isPending && (!ready || count === null));
	const expiry = credit?.expiresAt
		? formatDate(new Date(credit.expiresAt), { month: "short", day: "numeric" })
		: null;
	const formattedCount = formatNumber(count ?? 0);
	const visibleNotice = notice?.scope === scope ? notice.kind : null;
	if (!external && !canUse && count === 0 && !visibleNotice && !open)
		return null;
	const showConfirmation = () => {
		if (!data || !canUse) return;
		setNotice(null);
		setConfirmation({
			scope,
			identity: data.identity,
			email: data.email,
			...(data.pendingAttempt ?? {
				idempotencyKey: crypto.randomUUID(),
				creditId: credit?.id,
			}),
		});
	};
	return (
		<div
			className="mt-2 border-t pt-2 text-[11px] text-muted-foreground"
			data-fork-account-resets
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				{account.agent === "codex" && count !== null && count > 0 && (
					<span className="inline-flex items-center gap-1">
						<RotateCcw className="size-3" />
						<Trans>Free resets: {formattedCount}</Trans>
						{expiry && (
							<>
								{" "}
								· <Trans>Expires {expiry}</Trans>
							</>
						)}
					</span>
				)}
				{canUse && (
					<Button
						variant="link"
						size="sm"
						className="h-auto px-0 py-0 text-[11px]"
						onClick={showConfirmation}
					>
						<Trans>Use reset</Trans>
					</Button>
				)}
				{external && (
					<a
						href={
							account.agent === "claude"
								? "https://claude.ai/settings/usage"
								: "https://chatgpt.com/codex/settings/usage"
						}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
						title={t({
							message:
								"Check the account email in your browser before using a reset.",
						})}
					>
						<Trans>Manage resets on provider website</Trans>
						<ExternalLink className="size-3" />
					</a>
				)}
				{resets.enabled && resets.isPending && (
					<Trans>Checking free resets…</Trans>
				)}
			</div>
			{external && (
				<p className="mt-1 text-[10px]">
					<Trans>
						Check the account email in your browser before using a reset.
					</Trans>
				</p>
			)}
			{visibleNotice === "success" && (
				<output className="mt-1 block">
					<Trans>Reset applied. Usage is being refreshed.</Trans>
				</output>
			)}
			{visibleNotice === "none" && (
				<output className="mt-1 block">
					<Trans>No reset was used. Check the updated availability.</Trans>
				</output>
			)}
			{visibleNotice === "error" && !open && (
				<p role="alert" className="mt-1 text-warning">
					<Trans>
						Could not confirm the reset. Retry uses the same request.
					</Trans>
				</p>
			)}
			<Dialog
				open={open}
				onOpenChange={(value) => {
					if (!value && !resets.consume.isPending) setConfirmation(null);
				}}
			>
				<DialogContent
					data-fork-reset-dialog
					onEscapeKeyDown={(event) => {
						if (resets.consume.isPending) event.preventDefault();
					}}
					onPointerDownOutside={(event) => {
						if (resets.consume.isPending) event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>
							<Trans>Use a free reset?</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								This uses one reset for this account, across its chats. It
								cannot be undone.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="break-all">
							{hideEmail && revealedAttempt !== confirmation?.idempotencyKey ? (
								<Trans>Hidden email</Trans>
							) : (
								confirmation?.email
							)}
						</span>
						{hideEmail && revealedAttempt !== confirmation?.idempotencyKey && (
							<Button
								variant="link"
								size="sm"
								className="h-auto p-0"
								onClick={() =>
									setRevealedAttempt(confirmation?.idempotencyKey ?? null)
								}
							>
								<Trans>Show emails</Trans>
							</Button>
						)}
					</div>
					{visibleNotice === "error" && (
						<p role="alert" className="text-xs text-warning">
							<Trans>
								Could not confirm the reset. Retry uses the same request.
							</Trans>
						</p>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							disabled={resets.consume.isPending}
							onClick={() => setConfirmation(null)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={
								resets.consume.isPending ||
								!confirmation ||
								confirmation.identity !== data?.identity ||
								!canUse ||
								(hideEmail &&
									revealedAttempt !== confirmation.idempotencyKey) ||
								!ready
							}
							onClick={() => {
								if (!confirmation || confirmation.scope !== scope) return;
								const chosen = confirmation;
								setNotice(null);
								resets.consume.mutate(
									{
										expectedIdentity: chosen.identity,
										idempotencyKey: chosen.idempotencyKey,
										creditId: chosen.creditId,
									},
									{
										onSuccess: (result) => {
											setConfirmation((current) =>
												current?.scope === chosen.scope ? null : current,
											);
											setNotice({
												scope: chosen.scope,
												kind:
													result.outcome === "reset" ||
													result.outcome === "alreadyRedeemed"
														? "success"
														: "none",
											});
										},
										onError: () =>
											setNotice({ scope: chosen.scope, kind: "error" }),
									},
								);
							}}
						>
							{resets.consume.isPending && (
								<Loader2 className="size-3 animate-spin" aria-hidden="true" />
							)}
							<Trans>Use reset</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
