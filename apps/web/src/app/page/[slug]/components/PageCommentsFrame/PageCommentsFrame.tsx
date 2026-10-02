"use client";

import { usePageStorageBridge } from "@superset/cloud-client";
import { PageCommentsView } from "@superset/ui/page-comments";
import { useCallback, useMemo } from "react";
import { env } from "@/env";
import { getAuthToken } from "../../../../../trpc/auth-token";

export function PageCommentsFrame({
	pageId,
	src,
	title,
	previewing = false,
	userId,
	name,
	image,
}: {
	pageId: string;
	src: string;
	title: string;
	previewing?: boolean;
	userId: string;
	name: string;
	image: string | null;
}) {
	const viewer = useMemo(
		() => ({ userId, name, image }),
		[userId, name, image],
	);
	const token = useCallback(() => getAuthToken().catch(() => null), []);
	const storage = usePageStorageBridge({
		pageId,
		realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
		viewer,
		token,
	});

	return (
		<PageCommentsView
			src={src}
			title={title}
			{...(previewing ? {} : { storage })}
		/>
	);
}
