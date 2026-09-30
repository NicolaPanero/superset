import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuSettings2 } from "react-icons/lu";
import type { ProviderAccount } from "../../../providers/useProviderConnections";
import { ChipButton } from "../ChipButton";

/**
 * Which connected account's events reach this trigger.
 *
 * Shown only when the choice exists — two or more accounts on the connector, or
 * a pin already set. One account is not a decision, and a chip asking for it
 * would add a word to every sentence to say the only thing it could say.
 *
 * A pin naming an account that is gone reads as unknown rather than silently
 * falling back to "any": the trigger really is firing on nothing, and the fix is
 * to pick again.
 */
export function AccountChip({
	accounts,
	value,
	onChange,
	onManage,
	disabled,
}: {
	accounts: ProviderAccount[];
	value: string | null | undefined;
	onChange: (connectionId: string | null) => void;
	/** Opens the connector's dialog, where every connected account is listed. */
	onManage?: () => void;
	disabled?: boolean;
}) {
	const { t } = useLingui();
	const current = accounts.find((account) => account.id === value);
	const label = value
		? (current?.label ?? t({ message: "Unknown account" }))
		: t({ message: "any account" });

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={label}
						empty={Boolean(value) && !current}
						disabled={disabled}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				{accounts.map((account) => (
					<DropdownMenuItem
						key={account.id}
						className="relative pr-8"
						onSelect={() => onChange(account.id)}
					>
						{account.label ?? account.id}
						{account.id === value && (
							<span className="absolute right-2 flex size-3.5 items-center justify-center">
								<LuCheck className="size-4" />
							</span>
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuItem
					className="relative pr-8"
					onSelect={() => onChange(null)}
				>
					<Trans>Any account</Trans>
					{!value && (
						<span className="absolute right-2 flex size-3.5 items-center justify-center">
							<LuCheck className="size-4" />
						</span>
					)}
				</DropdownMenuItem>
				{onManage && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={onManage}>
							<LuSettings2 className="size-3.5 shrink-0 text-current" />
							<Trans>Manage accounts…</Trans>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
