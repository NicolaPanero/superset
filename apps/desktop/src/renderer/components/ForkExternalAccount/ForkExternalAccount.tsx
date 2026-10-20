import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { useForkCliOptions } from "renderer/stores/fork-cli-options";

export function ForkExternalAccount({
	external,
	children,
}: {
	external: boolean;
	children: ReactNode;
}) {
	const showCliOptions = useForkCliOptions();
	if (external && !showCliOptions) return null;
	if (!external) return children;
	return (
		<details className="rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
			<summary className="cursor-pointer">
				<Trans>CLI login</Trans>
			</summary>
			<p className="mt-2 mb-2 text-[11px]">
				<Trans>
					This login follows changes made in the CLI. Use a separate account
					profile to keep Superset independent.
				</Trans>
			</p>
			{children}
		</details>
	);
}
