import * as Sentry from "@sentry/cloudflare";
import type { PageStorageHubRequest } from "@superset/shared/page-storage-hub";
import {
	isRealtimeNudgeKind,
	isRealtimeUpdate,
} from "@superset/shared/realtime";
import { verifyPageStorageTicket } from "@superset/shared/usercontent";
import { verifyJWT } from "@superset/shared/verify-jwt";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getServerByName } from "partyserver";
import { OrgHub } from "./org-hub";
import { PageHub } from "./page-hub";
import type { RealtimeEnv } from "./types";

type AppContext = { Bindings: RealtimeEnv };

const app = new Hono<AppContext>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

function extractToken(c: Context<AppContext>): string | null {
	const header = c.req.header("Authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return c.req.query("token") ?? null;
}

// A failed auth on a WebSocket upgrade completes the handshake and closes
// with a reason, the only way a browser client can see why.
function acceptAndClose(code: number, reason: string): Response {
	const pair = new WebSocketPair();
	pair[1].accept();
	pair[1].close(code, reason);
	return new Response(null, { status: 101, webSocket: pair[0] });
}

// ── Subscribe: one socket per window, per organization ─────────────

app.get("/v2/org/:organizationId/nudges", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const organizationId = c.req.param("organizationId");
	const token = extractToken(c);
	if (!token) return acceptAndClose(4401, "Unauthorized");
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return acceptAndClose(4401, "Unauthorized");
	// Nudges carry no data, so organization membership is the whole check.
	if (!auth.organizationIds.includes(organizationId)) {
		return acceptAndClose(4403, "Not a member of this organization");
	}
	const stub = await getServerByName(c.env.OrgHub, organizationId);
	return stub.fetch("https://realtime/subscribe", {
		headers: { Upgrade: "websocket" },
	});
});

app.post("/v2/page/:pageId/storage", async (c) => {
	const token = extractToken(c);
	if (!token || token !== c.env.NUDGE_SECRET) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const request = (await c.req
		.json()
		.catch(() => null)) as PageStorageHubRequest | null;
	if (!request || typeof request.op !== "string") {
		return c.json({ error: "op required" }, 400);
	}
	const stub = await getServerByName(c.env.PageHub, c.req.param("pageId"));
	return c.json(await stub.apply(request));
});

app.get("/v2/page/:pageId/storage/subscribe", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const pageId = c.req.param("pageId");
	const ticket = extractToken(c);
	if (!ticket) return acceptAndClose(4401, "Unauthorized");
	const claims = await verifyPageStorageTicket(c.env.NUDGE_SECRET, ticket);
	if (!claims || claims.pageId !== pageId) {
		return acceptAndClose(4401, "Unauthorized");
	}
	const stub = await getServerByName(c.env.PageHub, pageId);
	return stub.fetch("https://realtime/subscribe", {
		headers: { Upgrade: "websocket" },
	});
});

// ── Emit: the API, after a write ────────────────────────────────────

app.post("/v2/nudge", async (c) => {
	const token = extractToken(c);
	if (!token || token !== c.env.NUDGE_SECRET) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const body = (await c.req.json().catch(() => null)) as {
		organizationId?: unknown;
		kind?: unknown;
		update?: unknown;
	} | null;
	const organizationId = body?.organizationId;
	if (typeof organizationId !== "string" || organizationId.length === 0) {
		return c.json({ error: "organizationId required" }, 400);
	}
	if (!isRealtimeNudgeKind(body?.kind)) {
		return c.json({ error: "unknown kind" }, 400);
	}
	if (body?.update !== undefined && !isRealtimeUpdate(body.update)) {
		return c.json({ error: "invalid update" }, 400);
	}
	const stub = await getServerByName(c.env.OrgHub, organizationId);
	await stub.nudge(body.kind, body?.update);
	return c.json({ ok: true });
});

// Exceptions only, as on the relay: console capture at this volume is a
// memory leak, and a peer going away is not an error.
function isPeerGone(message: string): boolean {
	return (
		message === "Network connection lost." ||
		message.startsWith(
			"Connection closed: this Durable Object instance is no longer active",
		)
	);
}

const sentryOptions = (env: RealtimeEnv): Sentry.CloudflareOptions => ({
	dsn: env.SENTRY_DSN,
	sendDefaultPii: false,
	integrations: (defaults) =>
		defaults.filter((integration) => integration.name !== "Console"),
	beforeSend: (event) => {
		const message = event.exception?.values?.[0]?.value;
		return message && isPeerGone(message) ? null : event;
	},
});

const InstrumentedOrgHub = Sentry.instrumentDurableObjectWithSentry(
	sentryOptions,
	OrgHub,
);
const InstrumentedPageHub = Sentry.instrumentDurableObjectWithSentry(
	sentryOptions,
	PageHub,
);
export { InstrumentedOrgHub as OrgHub, InstrumentedPageHub as PageHub };

export default Sentry.withSentry(sentryOptions, {
	fetch: app.fetch,
} satisfies ExportedHandler<RealtimeEnv>);
