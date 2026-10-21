import { Trans } from "@lingui/react/macro";
import { FaBitbucket, FaGithub } from "react-icons/fa";

export function ForkScmLinkLabel({
	url,
	showIcon = false,
}: {
	url: string;
	showIcon?: boolean;
}) {
	let bitbucket = false;
	try {
		bitbucket = new URL(url).hostname === "bitbucket.org";
	} catch {}
	const Icon = bitbucket ? FaBitbucket : FaGithub;
	return (
		<>
			{showIcon && <Icon className="size-3" aria-hidden="true" />}
			{bitbucket ? (
				<Trans>View on Bitbucket</Trans>
			) : (
				<Trans>View on GitHub</Trans>
			)}
		</>
	);
}
