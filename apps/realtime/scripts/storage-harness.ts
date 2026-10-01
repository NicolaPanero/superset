import { readFileSync } from "node:fs";
import { PAGE_COMMENTS_RUNTIME_SOURCE } from "@superset/shared/page-comments-runtime";
import {
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import {
	pageStorageOpPath,
	pageStorageSubscribePath,
} from "@superset/shared/page-storage-hub";
import { PAGE_STORAGE_RUNTIME_SOURCE } from "@superset/shared/page-storage-runtime";
import {
	injectHeadScriptTag,
	injectScriptTag,
	injectStyleTag,
	PAGE_THEME_CSS,
	RUNTIME_SCRIPT_PATH,
	STORAGE_SCRIPT_PATH,
	signPageStorageTicket,
} from "@superset/shared/usercontent";

const PAGE_FILE =
	process.env.PAGE_FILE ??
	`${import.meta.dir}/../../../plans/20260930-storage-v0-vote.html`;

const HUB = process.env.HUB_URL ?? "http://127.0.0.1:8798";
const SECRET = process.env.NUDGE_SECRET ?? "local-test-secret";
const PAGE_ID = process.env.PAGE_ID ?? "55555555-5555-4555-8555-555555555555";
const HOST_PORT = 8787;
const PAGE_PORT = 8788;
const PAGE_ORIGIN = `http://localhost:${PAGE_PORT}`;

const PEOPLE = ["Ada", "Grace", "Alan", "Katherine"];

Bun.serve({
	port: PAGE_PORT,
	fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === RUNTIME_SCRIPT_PATH) {
			return new Response(PAGE_COMMENTS_RUNTIME_SOURCE, {
				headers: { "content-type": "text/javascript; charset=utf-8" },
			});
		}
		if (pathname === STORAGE_SCRIPT_PATH) {
			return new Response(PAGE_STORAGE_RUNTIME_SOURCE, {
				headers: { "content-type": "text/javascript; charset=utf-8" },
			});
		}

		const html = injectHeadScriptTag(
			injectStyleTag(
				injectScriptTag(readFileSync(PAGE_FILE, "utf8"), RUNTIME_SCRIPT_PATH),
				PAGE_THEME_CSS,
			),
			STORAGE_SCRIPT_PATH,
		);
		return new Response(html, {
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	},
});

async function hub(body: unknown): Promise<Response> {
	const response = await fetch(`${HUB}${pageStorageOpPath(PAGE_ID)}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${SECRET}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
	return new Response(await response.text(), {
		status: response.status,
		headers: { "content-type": "application/json" },
	});
}

Bun.serve({
	port: HOST_PORT,
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/subscribe-url") {
			const ticket = await signPageStorageTicket(SECRET, {
				pageId: PAGE_ID,
				exp: Math.floor(Date.now() / 1000) + 900,
			});
			const ws = `${HUB.replace(/^http/, "ws")}${pageStorageSubscribePath(PAGE_ID)}?token=${encodeURIComponent(ticket)}`;
			return Response.json({ url: ws });
		}

		if (url.pathname === "/op" && request.method === "POST") {
			const { userId, op, key, value } = (await request.json()) as {
				userId: string;
				op: string;
				key: string;
				value?: unknown;
			};
			if (op === "getAll") return hub({ op, key });
			if (op === "get" || op === "remove") return hub({ op, userId, key });
			if (op === "set") return hub({ op, userId, key, value });
			if (op === "list") return hub({ op: "list" });
			if (op === "clear") return hub({ op: "clear" });
			return Response.json(
				{ ok: false, code: "invalid", message: op },
				{ status: 400 },
			);
		}

		return new Response(shell(), {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	},
});

function shell(): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>page storage harness</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; display: grid; grid-template-rows: auto 1fr; height: 100vh; }
  header { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
    padding: 0.6rem 1rem; border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent); font-size: 0.85rem; }
  select { font: inherit; padding: 0.2rem 0.4rem; }
  button { font: inherit; padding: 0.25rem 0.6rem; cursor: pointer; }
  iframe { border: 0; width: 100%; height: 100%; }
  code { font-size: 0.8rem; opacity: 0.7; }
  #served { margin-left: auto; opacity: 0.7; }
</style></head>
<body>
  <header>
    <label>viewing as
      <select id="who">${PEOPLE.map((p) => `<option value="${p}">${p}</option>`).join("")}</select>
    </label>
    <button id="reload">reload page</button>
    <button id="wipe">clear all votes</button>
    <code>page ${PAGE_ID.slice(0, 8)}…</code>
    <span id="served">0 calls served</span>
  </header>
  <iframe id="frame" src="${PAGE_ORIGIN}/?v=1"></iframe>

<script>
  const FRAME = ${JSON.stringify(STORAGE_FRAME_CHANNEL)};
  const HOST = ${JSON.stringify(STORAGE_HOST_CHANNEL)};
  const PAGE_ORIGIN = ${JSON.stringify(PAGE_ORIGIN)};

  const frame = document.getElementById("frame");
  const who = document.getElementById("who");
  let served = 0;

  const saved = sessionStorage.getItem("who");
  if (saved) {
    who.value = saved;
  } else {
    const options = [...who.options].map((o) => o.value);
    who.value = options[Math.floor(Math.random() * options.length)];
    sessionStorage.setItem("who", who.value);
  }
  who.addEventListener("change", () => {
    sessionStorage.setItem("who", who.value);
    frame.src = PAGE_ORIGIN + "/?v=" + Date.now();
  });

  const post = (body) =>
    frame.contentWindow?.postMessage({ channel: HOST, ...body }, PAGE_ORIGIN);

  const serve = async (request) => {
    const response = await fetch("/op", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: who.value, ...request }),
    });
    const body = await response.json();
    if (!body.ok) {
      const error = new Error(body.message || "refused");
      error.code = body.code || "unavailable";
      throw error;
    }
    if (request.op === "getAll") {
      return {
        op: "getAll",
        records: body.records.map((r) => ({
          userId: r.userId,
          name: r.userId,
          value: r.value,
          updatedAt: new Date(r.updatedAt).toISOString(),
        })),
      };
    }
    if (request.op === "get") {
      return { op: "get", value: body.record ? body.record.value : null };
    }
    return { op: request.op };
  };

  window.addEventListener("message", async (event) => {
    if (event.origin !== PAGE_ORIGIN) return;
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.channel !== FRAME) return;

    if (data.type === "hello") {
      post({ type: "hello", writable: true });
      watch();
      return;
    }
    if (data.type !== "call") return;

    served += 1;
    document.getElementById("served").textContent = served + " calls served";
    try {
      post({ type: "result", id: data.id, ok: true, result: await serve(data.request) });
    } catch (error) {
      post({
        type: "result", id: data.id, ok: false,
        code: error.code || "unavailable",
        message: error.message,
      });
    }
  });

  let socket = null;
  async function watch() {
    if (socket) return;
    const { url } = await (await fetch("/subscribe-url")).json();
    socket = new WebSocket(url);
    socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(event.data);
      if (parsed.type === "storage-changed") {
        post({ type: "changed", ...(parsed.key ? { key: parsed.key } : {}) });
      }
    });
    socket.addEventListener("close", () => {
      socket = null;
      setTimeout(watch, 1000);
    });
  }

  document.getElementById("reload").addEventListener("click", () => {
    frame.src = PAGE_ORIGIN + "/?v=" + Date.now();
  });
  document.getElementById("wipe").addEventListener("click", async () => {
    await fetch("/op", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: who.value, op: "clear", key: "" }),
    });
    frame.src = PAGE_ORIGIN + "/?v=" + Date.now();
  });
</script>
</body></html>`;
}

console.log(`host  http://localhost:${HOST_PORT}`);
console.log(`page  ${PAGE_ORIGIN}`);
console.log(`hub   ${HUB}`);
