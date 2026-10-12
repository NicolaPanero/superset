import { describe, expect, it, mock } from "bun:test";
import { createForkUpdateCheck } from "./fork-update-check";

const installed = "desktop-v1.37.0-fork.abc1234";
const newer = "desktop-v1.37.0-fork.def5678";

function fixture(latestRelease = mock(async () => newer)) {
	const offer = mock(async (_tag: string) => true);
	const upToDate = mock(async () => {});
	const failed = mock(async (_error: unknown, _interactive: boolean) => {});
	return {
		check: createForkUpdateCheck({
			installed,
			latestRelease,
			offer,
			upToDate,
			failed,
		}),
		latestRelease,
		offer,
		upToDate,
		failed,
	};
}

describe("fork update checks", () => {
	it("reoffers a postponed release on a manual check, keeping automatic checks quiet", async () => {
		const f = fixture();
		await f.check();
		await f.check();
		expect(f.offer).toHaveBeenCalledTimes(1);
		await f.check(true);
		expect(f.offer).toHaveBeenCalledTimes(2);
		await f.check();
		expect(f.offer).toHaveBeenCalledTimes(2);
		f.latestRelease.mockResolvedValue("desktop-v1.37.0-fork.ghi9012");
		await f.check();
		expect(f.offer).toHaveBeenCalledTimes(3);
	});

	it("shares an ongoing automatic check with repeated manual clicks", async () => {
		let resolve!: (tag: string) => void;
		const f = fixture(
			mock(
				() =>
					new Promise<string>((done) => {
						resolve = done;
					}),
			),
		);
		const automatic = f.check();
		const manual = f.check(true);
		expect(f.check(true)).toBe(automatic);
		expect(manual).toBe(automatic);
		resolve(installed);
		await manual;
		expect(f.latestRelease).toHaveBeenCalledTimes(1);
		expect(f.upToDate).toHaveBeenCalledTimes(1);
		f.latestRelease.mockResolvedValue(newer);
		await f.check();
		expect(f.offer).toHaveBeenCalledWith(newer);
	});

	it("does not open another dialog while an offer is already visible", async () => {
		let close!: () => void;
		const f = fixture();
		f.offer.mockImplementation(
			() =>
				new Promise<boolean>((done) => {
					close = () => done(true);
				}),
		);
		const first = f.check();
		await Promise.resolve();
		const second = f.check(true);
		expect(second).toBe(first);
		expect(f.offer).toHaveBeenCalledTimes(1);
		close();
		await second;
		expect(f.latestRelease).toHaveBeenCalledTimes(1);
	});

	it("reports no update only for an explicit check", async () => {
		const f = fixture(mock(async () => installed));
		await f.check();
		expect(f.upToDate).not.toHaveBeenCalled();
		await f.check(true);
		expect(f.upToDate).toHaveBeenCalledTimes(1);
		expect(f.offer).not.toHaveBeenCalled();
	});

	it("reports failures without claiming to be current and permits a retry", async () => {
		const error = new Error("HTTP 429");
		const f = fixture(
			mock(async () => {
				throw error;
			}),
		);
		await f.check();
		expect(f.failed).toHaveBeenLastCalledWith(error, false);
		await f.check(true);
		expect(f.failed).toHaveBeenLastCalledWith(error, true);
		expect(f.upToDate).not.toHaveBeenCalled();
		f.latestRelease.mockResolvedValue(newer);
		await f.check(true);
		expect(f.offer).toHaveBeenCalledWith(newer);
	});
	it("reoffers an update after preparation fails or is cancelled", async () => {
		const f = fixture();
		f.offer.mockResolvedValue(false);
		await f.check();
		await f.check();
		expect(f.offer).toHaveBeenCalledTimes(2);
		f.offer.mockResolvedValue(true);
		await f.check();
		await f.check();
		expect(f.offer).toHaveBeenCalledTimes(3);
	});
});
