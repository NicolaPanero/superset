import { db } from "@superset/db/client";
import { startedStatusProgress } from "@superset/db/seed-default-statuses";
import { sql } from "drizzle-orm";

/**
 * Gives every organization the "In Review" status new organizations get, right
 * after its "In Progress", and sets each native started status's progress from
 * how many started statuses the organization has.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again.
 *
 * Usage: bun run packages/trpc/scripts/add-in-review-status.ts [--apply]
 */

const UPDATE_BATCH_SIZE = 5_000;

const apply = process.argv.includes("--apply");

const missingInReview = sql`
	FROM task_statuses ip
	WHERE ip.external_provider IS NULL
		AND ip.type = 'started'
		AND ip.name = 'In Progress'
		AND NOT EXISTS (
			SELECT 1 FROM task_statuses r
			WHERE r.organization_id = ip.organization_id
				AND r.external_provider IS NULL
				AND r.name = 'In Review'
		)
`;

const missing = await db.execute<{ n: number }>(
	sql`SELECT count(*)::int AS n ${missingInReview}`,
);
console.log(`organizations to add In Review to: ${missing.rows[0]?.n ?? 0}`);

if (apply) {
	await db.execute(sql`
		INSERT INTO task_statuses (organization_id, name, color, type, position)
		SELECT ip.organization_id, 'In Review', '#0f783c', 'started', ip.position + 0.5
		${missingInReview}
	`);
}

const started = await db.execute<{
	id: string;
	organization_id: string;
	progress_percent: number | null;
}>(sql`
	SELECT id, organization_id, progress_percent
	FROM task_statuses
	WHERE external_provider IS NULL AND type = 'started'
	ORDER BY organization_id, position, id
`);

const byOrganization = new Map<string, typeof started.rows>();
for (const status of started.rows) {
	const statuses = byOrganization.get(status.organization_id) ?? [];
	statuses.push(status);
	byOrganization.set(status.organization_id, statuses);
}

const changes: Array<{ id: string; progress: number }> = [];
for (const statuses of byOrganization.values()) {
	const progress = startedStatusProgress(statuses.length);
	statuses.forEach((status, index) => {
		const next = progress[index];
		if (next !== undefined && status.progress_percent !== next) {
			changes.push({ id: status.id, progress: next });
		}
	});
}
console.log(`started statuses to set progress on: ${changes.length}`);

if (apply) {
	for (let i = 0; i < changes.length; i += UPDATE_BATCH_SIZE) {
		const batch = changes.slice(i, i + UPDATE_BATCH_SIZE);
		await db.execute(sql`
			UPDATE task_statuses s SET progress_percent = c.progress
			FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
				AS c(id uuid, progress real)
			WHERE s.id = c.id
		`);
		console.log(
			`updated ${Math.min(i + UPDATE_BATCH_SIZE, changes.length)}/${changes.length}`,
		);
	}
}

console.log(apply ? "done" : "dry run; pass --apply to write");
