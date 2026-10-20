import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

export function forkAccountLabel(
	option: {
		selection: string | null;
		label: string;
		alias?: string | null;
		managed?: boolean;
	},
	email?: string | null,
	cliLabel = i18n._(msg({ message: "CLI login" })),
): string {
	if (option.selection === null) return cliLabel;
	return (
		option.alias ?? (option.managed ? option.label : (email ?? option.label))
	);
}
