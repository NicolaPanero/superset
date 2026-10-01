import type {
	PageStorageOp,
	PageStoragePort,
	PageStorageResult,
} from "@superset/shared/page-storage";
import {
	pageStorageSocketPath,
	pageStorageTicketPath,
} from "@superset/shared/page-storage-hub";
import { useCallback, useMemo } from "react";
import { useCloudClient } from "../../providers/CloudClientProvider";

interface UsePageStorageBridgeOptions {
	pageId: string;
	realtimeUrl: string;
	viewer: { userId: string; name: string; image: string | null };
	token: () => Promise<string | null>;
}

export function usePageStorageBridge({
	pageId,
	realtimeUrl,
	viewer,
	token,
}: UsePageStorageBridgeOptions): PageStoragePort {
	const client = useCloudClient();

	const connect = useCallback(async () => {
		const jwt = await token().catch(() => null);
		if (!jwt) return null;

		let response: Response;
		try {
			response = await fetch(`${realtimeUrl}${pageStorageTicketPath(pageId)}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${jwt}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ name: viewer.name, image: viewer.image }),
			});
		} catch {
			return null;
		}
		if (!response.ok) return null;

		const body = (await response.json().catch(() => null)) as {
			ticket?: string;
			fallback?: boolean;
		} | null;
		if (body?.ticket) {
			const socket = `${realtimeUrl.replace(/^http/, "ws")}${pageStorageSocketPath(pageId)}?ticket=${encodeURIComponent(body.ticket)}`;
			return { kind: "socket" as const, url: socket };
		}
		if (body?.fallback) {
			return {
				kind: "bridge" as const,
				viewer,
				author: false,
				writable: true,
			};
		}
		return null;
	}, [pageId, realtimeUrl, token, viewer]);

	const call = useCallback(
		async (op: PageStorageOp): Promise<PageStorageResult> => {
			const store = client.page.store;
			switch (op.op) {
				case "get": {
					const { value } = await store.get.query({ pageId, key: op.key });
					return { op: "get", value };
				}
				case "getAll": {
					const { records } = await store.getAll.query({
						pageId,
						key: op.key,
					});
					return { op: "getAll", records };
				}
				case "set": {
					await store.set.mutate({ pageId, key: op.key, value: op.value });
					return { op: "set" };
				}
				case "remove": {
					await store.remove.mutate({ pageId, key: op.key });
					return { op: "remove" };
				}
			}
		},
		[client, pageId],
	);

	return useMemo(() => ({ connect, call }), [connect, call]);
}
