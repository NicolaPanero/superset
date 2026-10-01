import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	MAX_PAGE_STORAGE_VALUE_BYTES,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "./page-storage";

/**
 * How long the runtime waits for a host to answer its handshake before it
 * gives up and reports the API as unavailable. A page rendered with no host
 * at all — the thumbnail renderer, or a `file://` preview — has to reach a
 * decision rather than hang, so every call after this fails fast and the page
 * renders its empty state.
 */
const HELLO_TIMEOUT_MS = 2000;

/**
 * Backstop cadence for `subscribe`. The hub pushes a `changed` message the
 * moment anyone writes, so this only covers a dropped socket — hence slow.
 */
const POLL_INTERVAL_MS = 60000;

/**
 * Runs inside the served page and exposes `window.superset.storage`. Every
 * call is brokered: the page has no network, so the runtime posts the op to
 * the host, which holds the viewer's session, and resolves on the reply.
 */
export const PAGE_STORAGE_RUNTIME_SOURCE = `(() => {
	const FRAME = ${JSON.stringify(STORAGE_FRAME_CHANNEL)};
	const HOST = ${JSON.stringify(STORAGE_HOST_CHANNEL)};
	const MAX_VALUE_BYTES = ${MAX_PAGE_STORAGE_VALUE_BYTES};
	const MAX_KEY_LENGTH = ${MAX_PAGE_STORAGE_KEY_LENGTH};
	const HELLO_TIMEOUT_MS = ${HELLO_TIMEOUT_MS};
	const POLL_INTERVAL_MS = ${POLL_INTERVAL_MS};

	const pending = new Map();
	const watchers = new Map();
	let seq = 0;
	let host = null;
	let settleReady = null;

	const ready = new Promise((resolve) => {
		settleReady = resolve;
	});

	const settle = (value) => {
		if (!settleReady) return;
		const done = settleReady;
		settleReady = null;
		done(value);
	};

	const fail = (code, message) => {
		const error = new Error(message);
		error.code = code;
		return error;
	};

	const post = (message) => {
		parent.postMessage({ channel: FRAME, ...message }, "*");
	};

	// The host's listener may not be mounted when this script runs, so the
	// handshake retries until it is answered or the deadline passes. A page
	// with no host at all (the thumbnail renderer, a file:// preview) takes
	// the deadline and reports itself unavailable.
	if (parent === window) {
		settle(false);
	} else {
		const deadline = Date.now() + HELLO_TIMEOUT_MS;
		const knock = () => {
			if (!settleReady) return;
			if (Date.now() > deadline) {
				settle(false);
				return;
			}
			post({ type: "hello" });
			setTimeout(knock, 200);
		};
		knock();
	}

	addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== HOST) return;
		if (event.source !== parent) return;
		if (data.type === "hello") {
			host = { writable: Boolean(data.writable) };
			settle(true);
			return;
		}
		if (data.type === "changed") {
			for (const [key, fns] of watchers) {
				if (data.key !== undefined && data.key !== key) continue;
				for (const refresh of fns) refresh();
			}
			return;
		}
		if (data.type !== "result") return;
		const entry = pending.get(data.id);
		if (!entry) return;
		pending.delete(data.id);
		if (data.ok) entry.resolve(data.result);
		else entry.reject(fail(data.code, data.message));
	});

	const call = async (request) => {
		if (!(await ready)) {
			throw fail("unavailable", "Page storage is not available in this view");
		}
		const id = "s" + ++seq;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			post({ type: "call", id, request });
			setTimeout(() => {
				if (!pending.has(id)) return;
				pending.delete(id);
				reject(fail("unavailable", "Page storage did not answer"));
			}, 15000);
		});
	};

	const checkKey = (key) => {
		if (typeof key !== "string" || !key.length || key.length > MAX_KEY_LENGTH) {
			throw fail("invalid", "A storage key is 1 to " + MAX_KEY_LENGTH + " characters");
		}
		return key;
	};

	const checkValue = (value) => {
		let encoded;
		try {
			encoded = JSON.stringify(value ?? null);
		} catch {
			throw fail("invalid", "A storage value must be JSON");
		}
		if (new TextEncoder().encode(encoded).length > MAX_VALUE_BYTES) {
			throw fail("quota_exceeded", "A storage value is at most " + MAX_VALUE_BYTES + " bytes");
		}
		return value ?? null;
	};

	const storage = {
		ready,
		/** Whether this viewer may write at all; null until the handshake lands. */
		get writable() {
			return host ? host.writable : null;
		},
		async get(key) {
			const result = await call({ op: "get", key: checkKey(key) });
			return result.value ?? null;
		},
		async getAll(key) {
			const result = await call({ op: "getAll", key: checkKey(key) });
			return result.records || [];
		},
		async set(key, value) {
			await call({ op: "set", key: checkKey(key), value: checkValue(value) });
		},
		async remove(key) {
			await call({ op: "remove", key: checkKey(key) });
		},
		/**
		 * Re-reads whenever the page's hub says someone wrote, plus on focus
		 * and a slow timer in case the hub's socket dropped. Overlapping
		 * refreshes collapse into one, so a burst of other people's votes
		 * costs a single read.
		 */
		subscribe(key, onRecords) {
			checkKey(key);
			let stopped = false;
			let timer = 0;
			let inFlight = false;
			let again = false;

			const read = async () => {
				if (stopped) return;
				if (inFlight) {
					again = true;
					return;
				}
				inFlight = true;
				try {
					const records = await storage.getAll(key);
					if (!stopped) onRecords(records);
				} catch {}
				inFlight = false;
				if (again && !stopped) {
					again = false;
					read();
				}
			};

			const tick = () => {
				read();
				if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
			};
			const onFocus = () => {
				if (document.visibilityState === "visible") read();
			};

			const fns = watchers.get(key) || new Set();
			fns.add(read);
			watchers.set(key, fns);

			tick();
			addEventListener("visibilitychange", onFocus);
			addEventListener("focus", onFocus);
			return () => {
				stopped = true;
				if (timer) clearTimeout(timer);
				fns.delete(read);
				if (!fns.size) watchers.delete(key);
				removeEventListener("visibilitychange", onFocus);
				removeEventListener("focus", onFocus);
			};
		},
	};

	window.superset = window.superset || {};
	window.superset.storage = storage;
})();`;
