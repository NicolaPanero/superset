import type { ForkProviderId } from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { SiBitbucket, SiJira } from "react-icons/si";
import { VscGithub } from "react-icons/vsc";

export function ForkProviderIcon({
	provider,
	className,
}: {
	provider: ForkProviderId;
	className?: string;
}) {
	const Icon =
		provider === "bitbucket"
			? SiBitbucket
			: provider === "jira"
				? SiJira
				: VscGithub;
	const label =
		provider === "bitbucket"
			? "Bitbucket"
			: provider === "jira"
				? "Jira"
				: "GitHub";
	return (
		<span
			title={label}
			className="inline-flex shrink-0"
			role="img"
			aria-label={label}
		>
			<Icon
				aria-hidden="true"
				className={cn(
					"size-3.5",
					provider !== "github" && "text-blue-500",
					className,
				)}
			/>
		</span>
	);
}
