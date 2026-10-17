import { expect, test } from "bun:test";
import { extraDirectories } from "./acpAdapter";

const folders = { additionalDirectories: ["/work/extra"] };

test("project folders reach only agents that advertise additional directories", () => {
	expect(
		extraDirectories(folders, {
			sessionCapabilities: { additionalDirectories: {} },
		}),
	).toEqual(folders);
	expect(extraDirectories(folders, { sessionCapabilities: {} })).toEqual({});
	expect(extraDirectories(folders, {})).toEqual({});
	expect(
		extraDirectories(
			{ additionalDirectories: [] },
			{ sessionCapabilities: { additionalDirectories: {} } },
		),
	).toEqual({});
});
