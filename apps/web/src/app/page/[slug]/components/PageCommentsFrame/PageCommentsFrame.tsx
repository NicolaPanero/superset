"use client";

import { usePageStorageBridge } from "@superset/cloud-client";
import { PageCommentsView } from "@superset/ui/page-comments";
import { env } from "@/env";
import { getAuthToken } from "../../../../../trpc/auth-token";

export function PageCommentsFrame({
	pageId,
	src,
	title,
	previewing = false,
	viewer,
}: {
	pageId: string;
	src: string;
	title: string;
	previewing?: boolean;
	viewer: { userId: string; name: string; image: string | null };
}) {
	const storage = usePageStorageBridge({
		pageId,
		realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
		viewer,
		token: () => getAuthToken().catch(() => null),
	});

	return (
		<PageCommentsView
			src={src}
			title={title}
			{...(previewing ? {} : { storage })}
		/>
	);
}
