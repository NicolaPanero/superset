import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	MAX_PAGE_STORAGE_VALUE_BYTES,
} from "@superset/shared/page-storage";
import { z } from "zod";
import { pageFields } from "../schema";

const storageRef = {
	pageId: pageFields.id,
	key: z.string().min(1).max(MAX_PAGE_STORAGE_KEY_LENGTH),
};

export const readPageStorageSchema = z.object(storageRef);

/**
 * The value ceiling is checked here so an over-size write is refused before
 * the row is read, and again in the procedure against the page's total.
 */
export const writePageStorageSchema = z.object({
	...storageRef,
	value: z
		.unknown()
		.refine(
			(value) =>
				new TextEncoder().encode(JSON.stringify(value ?? null)).length <=
				MAX_PAGE_STORAGE_VALUE_BYTES,
			`A stored value is at most ${MAX_PAGE_STORAGE_VALUE_BYTES} bytes of JSON`,
		),
});

export const clearPageStorageSchema = z.object({
	pageId: pageFields.id,
	/** Absent clears every key this viewer wrote on the page. */
	key: z.string().min(1).max(MAX_PAGE_STORAGE_KEY_LENGTH).optional(),
});
