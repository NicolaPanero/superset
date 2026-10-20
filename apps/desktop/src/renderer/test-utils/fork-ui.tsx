import { afterAll, afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	notifyManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
notifyManager.setScheduler((callback) => queueMicrotask(callback));
export const { act, cleanup, render, renderHook, fireEvent } = await import(
	"@testing-library/react"
);
const clients: QueryClient[] = [];
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});
afterAll(async () => {
	notifyManager.setScheduler((callback) => setTimeout(callback, 0));
	if (!registered) await GlobalRegistrator.unregister();
});
export function queryFixture() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	clients.push(client);
	return {
		client,
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	};
}
export async function flush() {
	await act(async () => {
		for (let index = 0; index < 20; index++) await Promise.resolve();
	});
}
