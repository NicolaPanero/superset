import { useForkAccountSwitcher } from "../../../../../../providers/ForkAccountSwitchProvider";
import { AccountAvatar } from "../AccountAvatar";

/** The chat's current login, shown on the model pill when there is a choice. */
export function ForkAccountBadge() {
	const switcher = useForkAccountSwitcher();
	const current = switcher?.accounts.find(
		(account) => account.selection === switcher.current,
	);
	if (!current) return null;
	return (
		<span title={current.email ?? current.name}>
			<AccountAvatar
				className="size-4 text-[7px]"
				colorKey={current.selection ?? "system"}
				name={current.name}
			/>
		</span>
	);
}
