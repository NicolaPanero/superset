import { db } from "@superset/db/client";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { sql } from "drizzle-orm";

/**
 * Retires the Linear task mirror once the two-way sync is gone.
 *
 * A mirrored row is a task whose status is one of Linear's (task_statuses with
 * external_provider = 'linear'); every such row was written by the sync. Native
 * tasks, including ones the sync once pushed to Linear, use native statuses.
 *
 * 1. A mirrored row that something references (any foreign key into tasks.id:
 *    v2_workspaces.task_id, cloud_workspace_tasks, ...) becomes a native task:
 *    its status moves to the org's native status of the same type and it gets a
 *    task_imports row carrying the Linear id and URL.
 * 2. A native task linked to a Linear issue gets the same task_imports row, so
 *    the link survives the external_* columns being dropped.
 * 3. Both kinds drop their external_* columns, so number-tasks.ts numbers them
 *    on the next run.
 * 4. Every other mirrored row is deleted, then the Linear statuses nothing uses.
 *
 * Host workspaces keep their own copy of task_id in host.db. Only the cloud
 * reference is visible here, so a host-only workspace pointing at a deleted row
 * reads "task not found" afterwards.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again. Run
 * number-tasks.ts --apply after it.
 *
 * Usage: bun run packages/trpc/scripts/prune-linear-mirror.ts [--apply]
 */

const DELETE_BATCH_BLOCKS = 2_000;
const PAUSE_BETWEEN_BATCHES_MS = 250;

const apply = process.argv.includes("--apply");

interface ReferencingColumn {
	table: string;
	column: string;
}

async function referencingColumns(): Promise<ReferencingColumn[]> {
	const rows = await db.execute<{ table_name: string; column_name: string }>(
		sql`
			SELECT format('%I.%I', n.nspname, c.relname) AS table_name,
				a.attname AS column_name
			FROM pg_constraint con
			JOIN pg_class c ON c.oid = con.conrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			JOIN pg_attribute a
				ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
			WHERE con.contype = 'f'
				AND con.confrelid = 'public.tasks'::regclass
				AND c.relname <> 'task_imports'
		`,
	);
	return rows.rows.map((row) => ({
		table: row.table_name,
		column: row.column_name,
	}));
}

function isReferenced(columns: ReferencingColumn[]) {
	if (columns.length === 0) return sql`false`;
	return sql.join(
		columns.map(
			(ref) =>
				sql`EXISTS (SELECT 1 FROM ${sql.raw(ref.table)} r WHERE r.${sql.raw(`"${ref.column}"`)} = t.id)`,
		),
		sql` OR `,
	);
}

const mirrored = sql`t.status_id IN (
	SELECT id FROM task_statuses WHERE external_provider = 'linear'
)`;

async function count(where: ReturnType<typeof sql>): Promise<number> {
	const result = await db.execute<{ n: number }>(
		sql`SELECT count(*)::int AS n FROM tasks t WHERE ${where}`,
	);
	return result.rows[0]?.n ?? 0;
}

async function convertReferenced(columns: ReferencingColumn[]) {
	const referenced = sql`${mirrored} AND (${isReferenced(columns)})`;
	const total = await count(referenced);
	console.log(`referenced mirrored rows to convert: ${total}`);
	if (!apply || total === 0) return;

	const orgs = await db.execute<{ organization_id: string }>(
		sql`SELECT DISTINCT t.organization_id FROM tasks t WHERE ${referenced}`,
	);
	for (const { organization_id } of orgs.rows) {
		await seedDefaultStatuses(organization_id);
	}

	await db.execute(sql`
		INSERT INTO task_imports (task_id, organization_id, provider, external_id, external_url, imported_by_user_id)
		SELECT t.id, t.organization_id, 'linear', t.external_id, t.external_url, NULL
		FROM tasks t
		WHERE ${referenced} AND t.external_id IS NOT NULL AND t.external_url IS NOT NULL
		ON CONFLICT DO NOTHING
	`);
	await db.execute(sql`
		UPDATE tasks t SET status_id = (
			SELECT s.id FROM task_statuses s, task_statuses linear_status
			WHERE linear_status.id = t.status_id
				AND s.organization_id = t.organization_id
				AND s.external_provider IS NULL
				AND s.type = CASE linear_status.type
					WHEN 'triage' THEN 'backlog'
					WHEN 'duplicate' THEN 'canceled'
					ELSE linear_status.type
				END
			ORDER BY s.position
			LIMIT 1
		)
		WHERE ${referenced}
	`);
}

async function linkNativeTasks() {
	const linked = sql`t.external_provider = 'linear'
		AND t.external_id IS NOT NULL
		AND t.external_url IS NOT NULL
		AND NOT (${mirrored})
		AND NOT EXISTS (SELECT 1 FROM task_imports i WHERE i.task_id = t.id)`;
	console.log(
		`native tasks to record as Linear imports: ${await count(linked)}`,
	);
	if (!apply) return;
	await db.execute(sql`
		INSERT INTO task_imports (task_id, organization_id, provider, external_id, external_url, imported_by_user_id)
		SELECT t.id, t.organization_id, 'linear', t.external_id, t.external_url, NULL
		FROM tasks t WHERE ${linked}
		ON CONFLICT DO NOTHING
	`);
}

async function detachImported() {
	const attached = sql`t.external_provider = 'linear'
		AND EXISTS (SELECT 1 FROM task_imports i WHERE i.task_id = t.id)`;
	console.log(`imported tasks to detach from Linear: ${await count(attached)}`);
	if (!apply) return;
	await db.execute(sql`
		UPDATE tasks t SET
			external_provider = NULL,
			external_id = NULL,
			external_key = NULL,
			external_url = NULL,
			external_updated_at = NULL,
			external_project_id = NULL,
			external_project_name = NULL,
			external_cycle_id = NULL,
			external_cycle_name = NULL,
			last_synced_at = NULL,
			sync_error = NULL
		WHERE ${attached}
	`);
}

async function deleteUnreferenced(columns: ReferencingColumn[]) {
	const unreferenced = sql`${mirrored} AND NOT (${isReferenced(columns)})`;
	const total = await count(unreferenced);
	console.log(`unreferenced mirrored rows to delete: ${total}`);
	if (!apply) return;

	const pages = await db.execute<{ blocks: number }>(
		sql`SELECT (pg_relation_size('tasks') / current_setting('block_size')::int)::int AS blocks`,
	);
	const blocks = pages.rows[0]?.blocks ?? 0;

	// Walks the table in physical order: on cold storage a block-range scan reads
	// sequentially, where picking rows through an index reads one page per row.
	let deleted = 0;
	for (let block = 0; block < blocks; block += DELETE_BATCH_BLOCKS) {
		const result = await db.execute(sql`
			DELETE FROM tasks t
			WHERE t.ctid >= ${`(${block},0)`}::tid
				AND t.ctid < ${`(${block + DELETE_BATCH_BLOCKS},0)`}::tid
				AND ${unreferenced}
		`);
		deleted += result.rowCount ?? 0;
		console.log(
			`deleted ${deleted}/${total} (block ${Math.min(block + DELETE_BATCH_BLOCKS, blocks)}/${blocks})`,
		);
		await new Promise((resolve) =>
			setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS),
		);
	}
}

async function deleteUnusedLinearStatuses() {
	const unused = sql`s.external_provider = 'linear'
		AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.status_id = s.id)`;
	const result = await db.execute<{ n: number }>(
		sql`SELECT count(*)::int AS n FROM task_statuses s WHERE ${unused}`,
	);
	console.log(`unused Linear statuses to delete: ${result.rows[0]?.n ?? 0}`);
	if (!apply) return;
	await db.execute(sql`DELETE FROM task_statuses s WHERE ${unused}`);
}

const columns = await referencingColumns();
console.log(
	`references into tasks.id: ${columns.map((ref) => `${ref.table}.${ref.column}`).join(", ") || "none"}`,
);
await convertReferenced(columns);
await linkNativeTasks();
await detachImported();
await deleteUnreferenced(columns);
await deleteUnusedLinearStatuses();
console.log(apply ? "done" : "dry run; pass --apply to write");
