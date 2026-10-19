import { afterEach, expect, test } from "bun:test";
import { httpBatchLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { fireEvent, queryFixture, render } from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { ForkConnectionCard } from "./ForkConnectionCard";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});

test("reusing an authenticated GitHub CLI reconnects repository access without another login", async () => {
	let enabled = 0;
	const t = initTRPC.create({ transformer: superjson });
	const connection = {
		id: "system:github",
		provider: "github",
		mode: "system",
		enabled: false,
		state: "configured",
		verifiedAt: null as number | null,
		identity: null,
	};
	const router = t.router({
		system: t.router({
			detectGhCli: t.procedure.query(() => ({
				installed: true,
				authenticated: true,
				version: "2.80.0",
				path: "gh",
			})),
			detectBrew: t.procedure.query(() => ({
				installed: true,
				version: "4.0.0",
			})),
		}),
		forkConnections: t.router({
			list: t.procedure.query(() => ({
				version: 5,
				connections: [connection],
			})),
			enableSystemGithub: t.procedure.mutation(() => {
				enabled += 1;
				connection.enabled = true;
				connection.state = "connected";
				connection.verifiedAt = 1;
				return connection;
			}),
		}),
	});
	const server = Bun.serve({
		port: 0,
		fetch: (req) =>
			fetchRequestHandler({
				req,
				endpoint: "/trpc",
				router,
				createContext: () => ({}),
				allowMethodOverride: true,
			}),
	});
	servers.push(server);
	const query = queryFixture();
	const client = electronTrpc.createClient({
		links: [
			httpBatchLink({
				url: `${server.url.origin}/trpc`,
				transformer: superjson,
			}),
		],
	});
	const view = render(
		<electronTrpc.Provider client={client} queryClient={query.client}>
			<LocalHostServiceContext.Provider
				value={{
					machineId: "test",
					activeHostUrl: server.url.origin,
					activeOrganizationId: "test",
					activeOrganizationName: "Test",
					hostServiceStatus: "running",
					waitForHostReady: async () => server.url.origin,
				}}
			>
				<ForkConnectionCard
					provider="github"
					brokerUrl=""
					onOAuth={() => {}}
					onSetupOAuth={() => {}}
				/>
			</LocalHostServiceContext.Provider>
		</electronTrpc.Provider>,
		{ wrapper: query.wrapper },
	);
	fireEvent.click(
		await view.findByRole("button", { name: "Use local GitHub account" }),
	);
	await view.findByText("Connected");
	expect(enabled).toBe(1);
	expect(view.queryByRole("dialog")).toBeNull();
});
