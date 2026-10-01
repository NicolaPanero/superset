import { describe, expect, it } from "bun:test";
import {
	type FilePaneOpenRequest,
	FilePaneOpenRequests,
	FilePaneOpenTimeoutError,
} from "./file-pane-open-requests";

const input = {
	workspaceId: "ws-1",
	projectId: "project-1",
	paths: ["/repo/a.ts", "/repo/b.ts"],
	line: 12,
	target: "current-tab" as const,
};

describe("FilePaneOpenRequests", () => {
	it("emits the request and resolves with the pane ids the renderer reports", async () => {
		const requests = new FilePaneOpenRequests();
		const seen: FilePaneOpenRequest[] = [];
		requests.on("open-request", (request: FilePaneOpenRequest) => {
			seen.push(request);
		});

		const promise = requests.request(input, 1_000);
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject(input);
		expect(seen[0]?.requestId).toMatch(/^[0-9a-f]{16}$/);

		expect(
			requests.resolve(seen[0]?.requestId ?? "", {
				ok: true,
				paneIds: ["pane-a", "pane-b"],
			}),
		).toBe(true);
		await expect(promise).resolves.toEqual(["pane-a", "pane-b"]);
		expect(requests.pendingCount()).toBe(0);
	});

	it("rejects with the renderer's error", async () => {
		const requests = new FilePaneOpenRequests();
		let requestId = "";
		requests.on("open-request", (request: FilePaneOpenRequest) => {
			requestId = request.requestId;
		});
		const promise = requests.request(input, 1_000);
		requests.resolve(requestId, { ok: false, error: "no such workspace" });
		await expect(promise).rejects.toThrow("no such workspace");
	});

	it("times out when no renderer answers, and ignores a late answer", async () => {
		const requests = new FilePaneOpenRequests();
		let requestId = "";
		requests.on("open-request", (request: FilePaneOpenRequest) => {
			requestId = request.requestId;
		});
		const promise = requests.request(input, 5);
		await expect(promise).rejects.toBeInstanceOf(FilePaneOpenTimeoutError);
		expect(requests.resolve(requestId, { ok: true, paneIds: ["late"] })).toBe(
			false,
		);
	});

	it("keeps concurrent requests apart by id", async () => {
		const requests = new FilePaneOpenRequests();
		const ids: string[] = [];
		requests.on("open-request", (request: FilePaneOpenRequest) => {
			ids.push(request.requestId);
		});
		const first = requests.request(input, 1_000);
		const second = requests.request(input, 1_000);
		requests.resolve(ids[1] ?? "", { ok: true, paneIds: ["second"] });
		requests.resolve(ids[0] ?? "", { ok: true, paneIds: ["first"] });
		await expect(first).resolves.toEqual(["first"]);
		await expect(second).resolves.toEqual(["second"]);
	});
});
