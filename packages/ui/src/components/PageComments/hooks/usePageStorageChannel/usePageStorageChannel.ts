"use client";

import {
	type PageStorageErrorCode,
	type PageStorageFrameMessage,
	type PageStoragePort,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import { type RefObject, useEffect, useRef, useState } from "react";

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
