import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { forkAcpTransportCloser } from "./fork-close-acp-transport";
import { AcpRpcClient } from "./rpcClient";

class ClosingProcess extends EventEmitter {
	stdin = { end: () => undefined };
	kill(): boolean {
		return true;
	}
}

function fixture(
	options: { kill?: () => void; confirm?: () => Promise<void> } = {},
) {
	const child = new ClosingProcess();
	const timers = new Map<number, () => void>();
	let killed = false;
	let confirmed = false;
	const close = forkAcpTransportCloser(
		child,
		{
			sample: async () => {},
			reap: async () => {},
			reapAndConfirm: async () => {
				await options.confirm?.();
				confirmed = true;
			},
		},
		{
			graceMs: 1,
			confirmMs: 1,
			kill:
				options.kill ??
				(() => {
					killed = true;
				}),
			schedule: (callback, delayMs) => {
				timers.set(delayMs, callback);
				return () => timers.delete(delayMs);
			},
		},
	);
	return {
		child,
		close,
		timers,
		killed: () => killed,
		confirmed: () => confirmed,
	};
}

test("sending SIGKILL does not confirm that the ACP process has exited", async () => {
	const f = fixture();
	const closing = f.close();
	let settled = false;
	void closing.then(() => {
		settled = true;
	});
	await Promise.resolve();
	f.timers.get(1)?.();
	await Promise.resolve();
	expect(f.killed()).toBe(true);
	expect(settled).toBe(false);
	expect(f.confirmed()).toBe(false);
	f.child.emit("close");
	await closing;
	expect(f.confirmed()).toBe(true);
	expect(f.timers.size).toBe(0);
});

test("an unconfirmed ACP exit rejects every close attempt", async () => {
	const f = fixture();
	const closing = f.close();
	const rejected = closing.catch((error: unknown) => error);
	await Promise.resolve();
	f.timers.get(1)?.();
	f.timers.get(2)?.();
	expect(await rejected).toMatchObject({
		message: "ACP agent exit was not confirmed",
	});
	expect(f.close()).toBe(closing);
	await expect(f.close()).rejects.toThrow("exit was not confirmed");
	expect(f.confirmed()).toBe(false);
});

test("ACP close propagates failure to terminate the process", async () => {
	const f = fixture({
		kill: () => {
			throw new Error("permission denied");
		},
	});
	const closing = f.close();
	const rejected = closing.catch((error: unknown) => error);
	await Promise.resolve();
	f.timers.get(1)?.();
	expect(await rejected).toMatchObject({ message: "permission denied" });
	expect(f.confirmed()).toBe(false);
});

test("an exited ACP process still requires descendant stop confirmation", async () => {
	const f = fixture({
		confirm: async () => {
			throw new Error("writer is still alive");
		},
	});
	f.child.emit("close");
	await expect(f.close()).rejects.toThrow("writer is still alive");
	expect(f.timers.size).toBe(0);
});

test("concurrent RPC close calls share a failed transport close", async () => {
	const stop = Promise.withResolvers<void>();
	let calls = 0;
	const client = new AcpRpcClient({
		createTransport: () => ({
			send: () => {},
			close: () => {
				calls += 1;
				return stop.promise;
			},
		}),
		onNotification: () => {},
		onServerRequest: () => {},
	});
	const closing = client.close();
	expect(client.close()).toBe(closing);
	const rejected = closing.catch((error: unknown) => error);
	stop.reject(new Error("exit unconfirmed"));
	expect(await rejected).toMatchObject({ message: "exit unconfirmed" });
	await expect(client.close()).rejects.toThrow("exit unconfirmed");
	expect(calls).toBe(1);
});
