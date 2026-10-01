"use client";

import {
	type PageStorageErrorCode,
	type PageStorageFrameMessage,
	type PageStoragePort,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * The host half of the page storage bridge. It answers the frame's handshake,
 * serves its calls through the port (which runs as the signed-in viewer), and
 * forwards the hub's change notifications into the frame so the page can
 * re-read.
 *
 * Every inbound message is checked against the frame's exact origin and its
 * own content window, the same way the comments channel is: the page is a
 * different origin, and a reply carrying someone else's data must never be
 * posted anywhere but back into that frame.
 */
export function usePageStorageChannel({
	frameRef,
	frameOrigin,
	port,
	writable = true,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	port?: PageStoragePort;
	writable?: boolean;
}): void {
	const portRef = useRef(port);
	portRef.current = port;
	/** Set once the frame has said hello, so a change is never posted into a
	 * window that has no runtime listening yet. */
	const [live, setLive] = useState(false);

	useEffect(() => {
		if (!port) return;

		const post = (body: Record<string, unknown>) => {
			frameRef.current?.contentWindow?.postMessage(
				{ channel: STORAGE_HOST_CHANNEL, ...body },
				frameOrigin,
			);
		};

		const onMessage = async (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as PageStorageFrameMessage | undefined;
			if (!data || data.channel !== STORAGE_FRAME_CHANNEL) return;

			if (data.type === "hello") {
				post({ type: "hello", writable });
				setLive(true);
				return;
			}
			if (data.type !== "call") return;

			const serve = portRef.current?.call;
			if (!serve) {
				post({
					type: "result",
					id: data.id,
					ok: false,
					code: "unavailable" satisfies PageStorageErrorCode,
					message: "Page storage is not available in this view",
				});
				return;
			}

			try {
				const result = await serve(data.request);
				post({ type: "result", id: data.id, ok: true, result });
			} catch (error) {
				post({
					type: "result",
					id: data.id,
					ok: false,
					...classify(error),
				});
			}
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [frameOrigin, frameRef, port, writable]);

	useEffect(() => {
		if (!live || !port?.watch) return;
		return port.watch((key) => {
			frameRef.current?.contentWindow?.postMessage(
				{
					channel: STORAGE_HOST_CHANNEL,
					type: "changed",
					...(key !== undefined ? { key } : {}),
				},
				frameOrigin,
			);
		});
	}, [frameOrigin, frameRef, live, port]);
}

/**
 * A page gets a code it can branch on, never our error text. The quota
 * messages carry their own prefix so the page can tell "too big" from
 * "not signed in" without parsing prose.
 */
function classify(error: unknown): {
	code: PageStorageErrorCode;
	message: string;
} {
	const raw = error instanceof Error ? error.message : String(error);
	if (raw.includes("quota_exceeded")) {
		return { code: "quota_exceeded", message: raw };
	}
	if (/UNAUTHORIZED|No active organization/i.test(raw)) {
		return { code: "unauthenticated", message: "Sign in to store data" };
	}
	if (/FORBIDDEN|NOT_FOUND/i.test(raw)) {
		return { code: "invalid", message: raw };
	}
	return { code: "unavailable", message: "Page storage could not be reached" };
}
