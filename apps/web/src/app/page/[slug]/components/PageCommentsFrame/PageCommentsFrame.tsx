"use client";

import { usePageStorageBridge } from "@superset/cloud-client";
import { PageCommentsView } from "@superset/ui/page-comments";

export function PageCommentsFrame({
	pageId,
	src,
	title,
}: {
	pageId: string;
	src: string;
	title: string;
}) {
	const storage = usePageStorageBridge({ pageId });

	return <PageCommentsView src={src} title={title} storage={storage} />;
}
