import { describe, expect, test } from "bun:test";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	MAX_PAGE_STORAGE_VALUE_BYTES,
	pageStorageValueBytes,
} from "@superset/shared/page-storage";
import { clearPageStorageSchema, writePageStorageSchema } from "./schema";

const pageId = "00000000-0000-4000-8000-000000000000";

describe("writePageStorageSchema", () => {
	test("accepts a small JSON value", () => {
		const parsed = writePageStorageSchema.parse({
			pageId,
			key: "lunch-vote",
			value: { choice: "Ramen" },
		});
		expect(parsed.value).toEqual({ choice: "Ramen" });
	});

	test("accepts null, which is how a page stores an empty answer", () => {
		expect(
			writePageStorageSchema.parse({ pageId, key: "k", value: null }).value,
		).toBeNull();
	});

	test("refuses a value over the ceiling", () => {
		const value = "x".repeat(MAX_PAGE_STORAGE_VALUE_BYTES + 1);
		expect(() =>
			writePageStorageSchema.parse({ pageId, key: "k", value }),
		).toThrow();
	});

	test("counts the serialized size, not the character count", () => {
		// A 4-byte emoji is one JS character but four bytes on the wire, so a
		// value that looks small by length can still break the ceiling.
		const emoji = "🎉".repeat(MAX_PAGE_STORAGE_VALUE_BYTES / 4);
		expect(pageStorageValueBytes(emoji)).toBeGreaterThan(
			MAX_PAGE_STORAGE_VALUE_BYTES,
		);
		expect(() =>
			writePageStorageSchema.parse({ pageId, key: "k", value: emoji }),
		).toThrow();
	});

	test("refuses an empty or over-long key", () => {
		expect(() =>
			writePageStorageSchema.parse({ pageId, key: "", value: 1 }),
		).toThrow();
		expect(() =>
			writePageStorageSchema.parse({
				pageId,
				key: "k".repeat(MAX_PAGE_STORAGE_KEY_LENGTH + 1),
				value: 1,
			}),
		).toThrow();
	});
});

describe("clearPageStorageSchema", () => {
	test("a key is optional, so clearing the whole page is expressible", () => {
		expect(clearPageStorageSchema.parse({ pageId }).key).toBeUndefined();
		expect(clearPageStorageSchema.parse({ pageId, key: "votes" }).key).toBe(
			"votes",
		);
	});
});
