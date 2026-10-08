import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuLoaderCircle } from "react-icons/lu";
import {
	type ForkAccountChoice,
	useForkAccountSwitcher,
} from "../../../../../../providers/ForkAccountSwitchProvider";
import { MENU_LABEL_CLASS, MENU_ROW_CLASS } from "../../../../constants";
import { AccountAvatar } from "../AccountAvatar";

function usageTone(usedPercent: number) {
	return usedPercent >= 90
		? "bg-red-500"
		: usedPercent >= 70
			? "bg-amber-500"
			: "bg-emerald-500";
}

/** Moves the chat to another login of the same agent, keeping its history. */
export function ForkAccountMenu({ onPicked }: { onPicked: () => void }) {
	const { t } = useLingui();
	const switcher = useForkAccountSwitcher();
	if (!switcher) return null;
	const current = switcher.accounts.find(
		(account) => account.selection === switcher.current,
	);

	const detail = (account: ForkAccountChoice) =>
		[
			account.email !== account.name ? account.email : null,
			account.isSystemDefault ? t({ message: "System default" }) : null,
			account.plan,
		]
			.filter(Boolean)
			.join(" · ");

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className={cn(MENU_ROW_CLASS, "h-9 text-[13px]")}>
				<span className="min-w-0 flex-1 truncate">
					<Trans>Account</Trans>
				</span>
				<span className="flex max-w-36 min-w-0 items-center gap-1.5 text-muted-foreground">
					{switcher.switching ? (
						<LuLoaderCircle className="size-3.5 shrink-0 animate-spin" />
					) : current ? (
						<AccountAvatar
							className="size-4 text-[7px]"
							colorKey={current.selection ?? "system"}
							name={current.name}
						/>
					) : null}
					<span className="truncate">
						{current?.name ?? <Trans>Configured account</Trans>}
					</span>
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-[290px] rounded-xl p-1">
				<div className={MENU_LABEL_CLASS}>
					{t({ message: `${switcher.agentLabel} accounts` })}
				</div>
				{switcher.accounts.map((account) => {
					const selected = account.selection === switcher.current;
					const used = account.usage
						? formatPercent(account.usage.usedPercent / 100)
						: null;
					return (
						<DropdownMenuItem
							className="items-start gap-2.5 rounded-lg px-2 py-2"
							disabled={switcher.switching}
							key={account.selection ?? "system"}
							onSelect={() => {
								onPicked();
								if (!selected) switcher.onSwitch(account.selection);
							}}
						>
							<AccountAvatar
								className="mt-0.5 size-7 text-[10px]"
								colorKey={account.selection ?? "system"}
								name={account.name}
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-xs font-medium text-foreground">
									{account.name}
								</span>
								{detail(account) ? (
									<span className="block truncate text-[11px] text-muted-foreground">
										{detail(account)}
									</span>
								) : null}
								{account.usage ? (
									<span className="mt-1.5 flex items-center gap-2">
										<span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
											<span
												className={cn(
													"block h-full rounded-full",
													usageTone(account.usage.usedPercent),
												)}
												style={{
													width: `${Math.min(100, Math.max(2, account.usage.usedPercent))}%`,
												}}
											/>
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
											{account.usage.label} · {used}
										</span>
									</span>
								) : null}
							</span>
							<span className="grid size-5 shrink-0 place-items-center">
								{selected ? <LuCheck className="size-3.5" /> : null}
							</span>
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
					<Trans>
						The chat keeps its history and continues on the account you pick,
						with that account's quota.
					</Trans>
				</p>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
