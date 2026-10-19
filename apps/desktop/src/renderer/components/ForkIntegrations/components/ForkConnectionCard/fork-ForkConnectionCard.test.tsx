import { afterEach, expect, spyOn, test } from "bun:test";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { waitFor } from "@testing-library/react";
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

function fixture({
	enabled,
	ghAuthenticated,
	credentialAvailable,
	brewInstalled = true,
}: {
	enabled: boolean;
	ghAuthenticated: boolean;
	credentialAvailable: boolean;
	brewInstalled?: boolean;
}) {
	const calls = { enable: 0, verify: 0 };
	let ghInstalled = ghAuthenticated;
	const t = initTRPC.create({ transformer: superjson });
	const connection: ForkConnection = {
		id: "system:github",
		provider: "github",
		mode: "system",
		enabled,
		state: enabled ? "error" : "disconnected",
		verifiedAt: 1,
		identity: null,
		site: "https://github.com",
		label: "GitHub",
		source: "system",
		error: enabled ? "No credentials found" : null,
		expiresAt: null,
		brokerUrl: null,
	};
	const verify = () => {
		connection.verifiedAt = Date.now();
		if (credentialAvailable) {
			connection.state = "connected";
			connection.source = "git-credential";
			connection.error = null;
			connection.identity = {
				id: "1",
				login: "global-user",
				name: "Global user",
				avatarUrl: null,
			};
		}
		return connection;
	};
	const router = t.router({
		system: t.router({
			detectGhCli: t.procedure.query(() => ({
				installed: ghInstalled,
				authenticated: ghAuthenticated,
				version: ghInstalled ? "2.80.0" : null,
				path: ghInstalled ? "gh" : null,
			})),
			detectBrew: t.procedure.query(() => ({
				installed: brewInstalled,
				version: brewInstalled ? "4.0.0" : null,
			})),
		}),
		forkConnections: t.router({
			list: t.procedure.query(() => ({
				version: 5,
				connections: [connection],
			})),
			enableSystemGithub: t.procedure.mutation(() => {
				calls.enable += 1;
				connection.enabled = true;
				return verify();
			}),
			verify: t.procedure.mutation(() => {
				calls.verify += 1;
				return verify();
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
	return {
		view,
		calls,
		query,
		setCredentialAvailable: (available: boolean) => {
			credentialAvailable = available;
		},
		setGhInstalled: (installed: boolean) => {
			ghInstalled = installed;
		},
	};
}

test("reusing an authenticated GitHub CLI reconnects repository access without another login", async () => {
	const { view, calls } = fixture({
		enabled: false,
		ghAuthenticated: true,
		credentialAvailable: true,
	});
	fireEvent.click(
		await view.findByRole("button", { name: "Use local GitHub account" }),
	);
	await view.findByText("Connected");
	expect(calls).toEqual({ enable: 1, verify: 0 });
	expect(view.queryByRole("dialog")).toBeNull();
});

test("saved Git credentials are discovered after an earlier failed check without installing gh", async () => {
	const { view, calls } = fixture({
		enabled: true,
		ghAuthenticated: false,
		credentialAvailable: true,
	});
	await view.findByText("Connected");
	expect(view.getByText("@global-user · git-credential")).toBeDefined();
	expect(view.getByText("GitHub CLI (gh) is not installed.")).toBeDefined();
	expect(
		view.getByText(
			"The guided terminal installs gh with Homebrew and opens GitHub sign-in.",
		),
	).toBeDefined();
	expect(
		view.getByRole("button", { name: "Install GitHub CLI" }),
	).toBeDefined();
	expect(view.queryByRole("dialog")).toBeNull();
	expect(calls).toEqual({ enable: 0, verify: 1 });
});

test("returning to the app checks again when saved Git credentials become available", async () => {
	const { view, calls, query, setCredentialAvailable } = fixture({
		enabled: true,
		ghAuthenticated: false,
		credentialAvailable: false,
	});
	await waitFor(() => expect(calls.verify).toBe(1));
	await waitFor(() => expect(query.client.isFetching()).toBe(0));
	setCredentialAvailable(true);
	fireEvent(window, new Event("focus"));
	await view.findByText("Connected");
	expect(calls).toEqual({ enable: 0, verify: 2 });
	expect(view.queryByRole("dialog")).toBeNull();
});

test("without Homebrew, the missing CLI flow opens the guide and checks a manual installation", async () => {
	const open = spyOn(window, "open").mockImplementation(() => null);
	try {
		const { view, calls, setGhInstalled } = fixture({
			enabled: false,
			ghAuthenticated: false,
			credentialAvailable: false,
			brewInstalled: false,
		});
		const guide = await view.findByRole("button", {
			name: "Open installation guide",
		});
		expect(open).not.toHaveBeenCalled();
		expect(
			view.queryByRole("button", { name: "Install GitHub CLI" }),
		).toBeNull();
		fireEvent.click(guide);
		expect(open).toHaveBeenCalledWith(
			"https://cli.github.com/",
			"_blank",
			"noopener,noreferrer",
		);
		expect(view.queryByRole("dialog")).toBeNull();
		setGhInstalled(true);
		fireEvent.click(view.getByRole("button", { name: "Check again" }));
		await view.findByRole("button", { name: "Connect GitHub repositories" });
		expect(view.queryByText("GitHub CLI (gh) is not installed.")).toBeNull();
		expect(calls).toEqual({ enable: 0, verify: 0 });
	} finally {
		open.mockRestore();
	}
});
