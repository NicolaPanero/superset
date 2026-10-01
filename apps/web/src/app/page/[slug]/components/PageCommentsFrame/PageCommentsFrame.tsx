"use client";

import { usePageStorageBridge } from "@superset/cloud-client";
import { PageCommentsView } from "@superset/ui/page-comments";

export function PageCommentsFrame({
	pageId,
	src,
	title,
	previewing = false,
}: {
	pageId: string;
	src: string;
	title: string;
	previewing?: boolean;
}) {
	const storage = usePageStorageBridge({ pageId });

	return (
		<PageCommentsView
			src={src}
			title={title}
			{...(previewing ? {} : { storage })}
		/>
	);
}
