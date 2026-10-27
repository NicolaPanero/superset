import { expect, test } from "bun:test";
import { createBrandRenameNotice } from "renderer/hooks/useDesktopNotices/utils/brandRenameNotice";
import { isForkReplacedBrandNotice } from "./fork-notices";

test("fork highlights replace only the dismissible informational upstream rebrand", () => {
	const notice = createBrandRenameNotice();
	expect(isForkReplacedBrandNotice(notice)).toBe(true);
	expect(isForkReplacedBrandNotice({ ...notice, severity: "blocking" })).toBe(
		false,
	);
	expect(isForkReplacedBrandNotice({ ...notice, dismissible: false })).toBe(
		false,
	);
	expect(isForkReplacedBrandNotice({ ...notice, id: "service-notice" })).toBe(
		false,
	);
	expect(isForkReplacedBrandNotice(null)).toBe(false);
});
