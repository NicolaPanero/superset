import { expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import { waitFor } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ReactNode } from "react";
import { queryFixture, renderHook } from "renderer/test-utils/fork-ui";
import { useForkBranchBase } from "./useForkBranchBase";

function fixture(initial: {
	baseBranch: string | null;
	currentBranch?: string;
	source?: "reflog" | "unknown";
	needsSelection?: boolean;
}) {
	const query = queryFixture();
	let base: {
		baseBranch: string | null;
		currentBranch?: string;
		source?: string;
		needsSelection?: boolean;
	} = initial;
	const writes: unknown[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			if (call.op.path === "git.setBaseBranch") {
				writes.push(call.op.input);
				base = { ...base, source: "configured" };
			}
			observer.next({
				result: {
					data:
						call.op.path === "git.setBaseBranch"
							? { baseBranch: base.baseBranch }
							: base,
				},
			});
			observer.complete();
		});
	const client = workspaceTrpc.createClient({ links: [link] });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<query.wrapper>
			<workspaceTrpc.Provider client={client} queryClient={query.client}>
				{children}
			</workspaceTrpc.Provider>
		</query.wrapper>
	);
	return {
		writes,
		view: renderHook(() => useForkBranchBase("workspace", { remember: true }), {
			wrapper,
		}),
	};
}

test("a detected origin is remembered once for the branch that was checked", async () => {
	const { writes, view } = fixture({
		baseBranch: "develop",
		currentBranch: "feature/work",
		source: "reflog",
		needsSelection: false,
	});
	await waitFor(() =>
		expect(view.result.current.data.source).toBe("configured"),
	);
	expect(writes).toEqual([
		{
			workspaceId: "workspace",
			baseBranch: "develop",
			expectedBranch: "feature/work",
			onlyIfUnset: true,
		},
	]);
	expect(view.result.current.data.baseBranch).toBe("develop");
});

test("an unknown origin uses HEAD until the user chooses a comparison branch", async () => {
	const { writes, view } = fixture({
		baseBranch: null,
		currentBranch: "feature/work",
		source: "unknown",
		needsSelection: true,
	});
	await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
	expect(view.result.current.data.baseBranch).toBe("HEAD");
	expect(view.result.current.data.needsSelection).toBe(true);
	expect(writes).toEqual([]);
});

test("an older host keeps its existing default without attempting automatic writes", async () => {
	const { writes, view } = fixture({ baseBranch: null });
	await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
	expect(view.result.current.data.baseBranch).toBeNull();
	expect(writes).toEqual([]);
});
