import type {
	PageStorageOp,
	PageStoragePort,
	PageStorageResult,
} from "@superset/shared/page-storage";
import { parsePageStorageChanged } from "@superset/shared/page-storage-hub";
import { useCallback, useMemo } from "react";
import { useCloudClient } from "../../providers/CloudClientProvider";

/** Reconnect backoff for the change socket, in milliseconds. */
const RETRY_MS = [1000, 2000, 5000, 15000];

/**
 * Serves a framed page's storage calls as the signed-in viewer, and keeps a
 * socket open to the page's hub so other people's writes arrive as they
 * happen. The page has no network of its own, so both halves live here.
 */
export function usePageStorageBridge({
	pageId,
}: {
	pageId: string;
}): PageStoragePort {
	const client = useCloudClient();

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

	/**
	 * The ticket behind the socket URL expires, so a reconnect mints a fresh
	 * one rather than retrying a URL that can only fail from now on.
	 */
	const watch = useCallback(
		(onChange: (key?: string) => void) => {
			let stopped = false;
			let socket: WebSocket | null = null;
			let timer: ReturnType<typeof setTimeout> | null = null;
			let attempt = 0;

			const connect = async () => {
				if (stopped) return;
				let url: string;
				try {
					({ url } = await client.page.store.subscribeUrl.query({ pageId }));
				} catch {
					schedule();
					return;
				}
				if (stopped) return;

				socket = new WebSocket(url);
				socket.addEventListener("open", () => {
					attempt = 0;
				});
				socket.addEventListener("message", (event) => {
					const message = parsePageStorageChanged(event.data);
					if (message) onChange(message.key);
				});
				socket.addEventListener("close", () => {
					socket = null;
					schedule();
				});
			};

			const schedule = () => {
				if (stopped || timer) return;
				const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] ?? 15000;
				attempt += 1;
				timer = setTimeout(() => {
					timer = null;
					connect();
				}, wait);
			};

			connect();

			return () => {
				stopped = true;
				if (timer) clearTimeout(timer);
				socket?.close();
			};
		},
		[client, pageId],
	);

	return useMemo(() => ({ call, watch }), [call, watch]);
}
