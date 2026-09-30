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
