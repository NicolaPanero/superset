import { expect, test } from "bun:test";
import { getVisibleMatchCountBySection } from "./settings-search";

test.each([
	{ acp: false, hidePro: false },
	{ acp: false, hidePro: true },
	{ acp: true, hidePro: false },
	{ acp: true, hidePro: true },
])("ACP visibility and hidden Pro settings remain independent: %j", ({
	acp,
	hidePro,
}) => {
	const counts = (query: string) =>
		getVisibleMatchCountBySection(query, true, true, true, false, acp, hidePro);
	expect(counts("acp").experimental).toBe(acp ? 1 : undefined);
	if (hidePro) expect(counts("billing").billing).toBeUndefined();
	else expect(counts("billing").billing).toBeGreaterThan(0);
});
