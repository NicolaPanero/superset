import { describe, expect, test } from "bun:test";
import { accountIdentity, accountLabels } from "./accountLabels";

describe("accountLabels", () => {
	test("a nickname titles the row and the identity moves below it", () => {
		expect(
			accountLabels(
				{ nickname: "Work", externalUserLabel: "satya@superset.sh" },
				"Google",
			),
		).toEqual({ title: "Work", subtitle: "satya@superset.sh" });
	});

	test("no nickname leaves one line, not the same line twice", () => {
		expect(
			accountLabels({ externalUserLabel: "satya@superset.sh" }, "Google"),
		).toEqual({ title: "satya@superset.sh", subtitle: null });
	});

	test("falls back to the account label when there is no user label", () => {
		expect(
			accountLabels({ externalAccountLabel: "Superset" }, "Linear"),
		).toEqual({ title: "Superset", subtitle: null });
	});

	test("names the connector when the provider sent no label at all", () => {
		expect(accountLabels({}, "Linear")).toEqual({
			title: "Linear account",
			subtitle: null,
		});
	});

	test("an empty nickname is not a title", () => {
		expect(
			accountLabels(
				{ nickname: "", externalUserLabel: "satya@superset.sh" },
				"Google",
			),
		).toEqual({ title: "satya@superset.sh", subtitle: null });
	});

	test("identity prefers the user over the account", () => {
		expect(
			accountIdentity({
				externalUserLabel: "satya@superset.sh",
				externalAccountLabel: "Superset",
			}),
		).toBe("satya@superset.sh");
	});
});
