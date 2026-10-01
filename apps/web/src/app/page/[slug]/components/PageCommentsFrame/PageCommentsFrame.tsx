"use client";

import { usePageStorageBridge } from "@superset/cloud-client";
import { PageCommentsView } from "@superset/ui/page-comments";

/**
 * The storage bridge is a function, so it has to be built on the client. The
 * route that renders the page is a server component, which is why the frame
 * moves in here rather than taking a prop.
 */
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
