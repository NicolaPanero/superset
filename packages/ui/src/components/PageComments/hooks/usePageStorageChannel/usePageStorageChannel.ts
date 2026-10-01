"use client";

import {
	type PageStorageErrorCode,
	type PageStorageFrameMessage,
	type PageStoragePort,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import { type RefObject, useEffect, useRef } from "react";

export function usePageStorageChannel({
	frameRef,
	frameOrigin,
	port,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	port?: PageStoragePort;
}): void {
	const portRef = useRef(port);
	portRef.current = port;

	useEffect(() => {
		if (!port) return;
		let stopped = false;
		let unwatch: (() => void) | undefined;

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
				const opened = await portRef.current?.connect?.();
				if (stopped) return;
				if (opened?.kind === "socket") {
					post({ type: "connect", url: opened.url });
					return;
				}
				if (opened?.kind === "bridge") {
					post({
						type: "bridge",
						viewer: opened.viewer,
						author: opened.author,
						writable: opened.writable,
					});
					unwatch ??= portRef.current?.watch?.((key) => {
						post({ type: "changed", ...(key !== undefined ? { key } : {}) });
					});
				}
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
				if (!stopped) post({ type: "result", id: data.id, ok: true, result });
			} catch (error) {
				if (!stopped) {
					post({ type: "result", id: data.id, ok: false, ...classify(error) });
				}
			}
		};

		window.addEventListener("message", onMessage);
		return () => {
			stopped = true;
			unwatch?.();
			window.removeEventListener("message", onMessage);
		};
	}, [frameOrigin, frameRef, port]);
}

const STORAGE_CODES: readonly PageStorageErrorCode[] = [
	"unavailable",
	"unauthenticated",
	"quota_exceeded",
	"rate_limited",
	"invalid",
	"revoked",
];

function classify(error: unknown): {
	code: PageStorageErrorCode;
	message: string;
} {
	const data = (error as { data?: Record<string, unknown> } | null)?.data;
	const declared = data?.pageStorageCode;
	if (
		typeof declared === "string" &&
		(STORAGE_CODES as readonly string[]).includes(declared)
	) {
		return {
			code: declared as PageStorageErrorCode,
			message: error instanceof Error ? error.message : String(error),
		};
	}
	if (data?.code === "UNAUTHORIZED") {
		return { code: "unauthenticated", message: "Sign in to store data" };
	}
	return { code: "unavailable", message: "Page storage could not be reached" };
}
