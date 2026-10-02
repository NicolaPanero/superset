import {
	parseRealtimeNudgeMessage,
	type RealtimeNudgeMessage,
	realtimeNudgesPath,
} from "@superset/shared/realtime";
import { AppState } from "react-native";
import { env } from "@/lib/env";
import { getHostAuthToken } from "@/lib/host/client";
import { setRealtimeConnected } from "./connection";

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const UNAUTHORIZED = 4401;

function nudgeUrl(organizationId: string, token: string): string {
	const url = new URL(
		`${env.EXPO_PUBLIC_REALTIME_URL}${realtimeNudgesPath(organizationId)}`,
	);
	url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
	url.searchParams.set("token", token);
	return url.toString();
}

/**
 * iOS drops sockets in the background, so this closes there and dials again
 * on return. `onReopen` fires only after a drop in the foreground: a return
 * from the background already refetches through React Query's focus refetch.
 */
export function openNudgeSocket(args: {
	organizationId: string;
	onMessage: (message: RealtimeNudgeMessage) => void;
	onReopen: () => void;
}): () => void {
	let socket: WebSocket | null = null;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let retryMs = MIN_RETRY_MS;
	let refreshToken = false;
	let everOpened = false;
	let dialing = false;
	let stopped = false;

	const drop = () => {
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = null;
		const current = socket;
		socket = null;
		current?.close(1000, "unsubscribed");
		setRealtimeConnected(false);
	};

	const scheduleRetry = () => {
		if (stopped || retryTimer) return;
		retryTimer = setTimeout(() => void connect(), retryMs);
		retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
	};

	const connect = async () => {
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = null;
		if (stopped || socket || dialing || AppState.currentState !== "active") {
			return;
		}
		dialing = true;
		let token: string;
		try {
			token = await getHostAuthToken({ forceRefresh: refreshToken });
		} catch {
			scheduleRetry();
			return;
		} finally {
			dialing = false;
		}
		if (stopped || socket || AppState.currentState !== "active") return;
		refreshToken = false;

		const next = new WebSocket(nudgeUrl(args.organizationId, token));
		socket = next;
		next.onopen = () => {
			if (socket !== next) return;
			retryMs = MIN_RETRY_MS;
			setRealtimeConnected(true);
			if (everOpened) args.onReopen();
			everOpened = true;
		};
		next.onmessage = (event) => {
			if (socket !== next) return;
			const message = parseRealtimeNudgeMessage(event.data);
			if (message) args.onMessage(message);
		};
		next.onclose = (event) => {
			if (socket !== next) return;
			socket = null;
			setRealtimeConnected(false);
			if (event.code === UNAUTHORIZED) refreshToken = true;
			scheduleRetry();
		};
	};

	const appState = AppState.addEventListener("change", (state) => {
		if (state === "active") {
			retryMs = MIN_RETRY_MS;
			void connect();
		} else if (state === "background") {
			everOpened = false;
			drop();
		}
	});

	void connect();
	return () => {
		stopped = true;
		appState.remove();
		drop();
	};
}
