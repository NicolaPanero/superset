import { db } from "@superset/db/client";
import { pages } from "@superset/db/schema";
import { asc, isNull } from "drizzle-orm";
import { writePageManifest } from "../src/router/page/storage";

/**
 * Rewrites every page's manifest so each one carries `organizationId` and
 * `createdByUserId`.
 *
 * A manifest is only written when something about a page changes, so a page
 * nobody has touched still has the shape from before those fields existed.
 * The storage hub decides access from the manifest alone, and a manifest
 * without an organization authorizes nobody, so this has to run and finish
 * before the Worker that reads them ships. Running it early is harmless: the
 * fields are ignored until then.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again, and
 * safe to interrupt: `writePageManifest` is idempotent and rebuilds a
 * manifest from the database every time, so a second run simply rewrites.
 * Taken-down pages are skipped, because for them the absence of a manifest is
 * the takedown.
 */
const apply = process.argv.includes("--apply");
const BATCH = 50;

const rows = await db
	.select({ id: pages.id, slug: pages.slug })
	.from(pages)
	.where(isNull(pages.takenDownAt))
	.orderBy(asc(pages.createdAt));

console.log(
	`${rows.length} page(s) to rewrite${apply ? "" : " (dry run; pass --apply)"}`,
);
if (!apply) process.exit(0);

let done = 0;
const failed: { id: string; slug: string; error: string }[] = [];

for (let index = 0; index < rows.length; index += BATCH) {
	const batch = rows.slice(index, index + BATCH);
	await Promise.all(
		batch.map(async (page) => {
			try {
				await writePageManifest(page.id);
				done += 1;
			} catch (error) {
				failed.push({
					id: page.id,
					slug: page.slug,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}),
	);
	console.log(`  ${Math.min(index + BATCH, rows.length)}/${rows.length}`);
}

console.log(`rewrote ${done} manifest(s)`);
if (failed.length > 0) {
	console.error(`${failed.length} failed:`);
	for (const row of failed) {
		console.error(`  ${row.slug} (${row.id}): ${row.error}`);
	}
	// A page left without the new fields would be refused by the hub, so a
	// partial run must not read as success.
	process.exit(1);
}
