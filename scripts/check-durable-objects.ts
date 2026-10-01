/**
 * A page's storage lives only in its PageHub, and an org's subscribers only
 * in its OrgHub. Listing either class under `deleted_classes` or
 * `renamed_classes` tells Cloudflare to destroy every instance's storage: the
 * deploy succeeds, silently, and the data is gone for good. No migration tag
 * may ever name one.
 */
import { readFileSync } from "node:fs";

interface Migration {
	tag: string;
	new_sqlite_classes?: string[];
	new_classes?: string[];
	deleted_classes?: string[];
	renamed_classes?: { from: string; to: string }[];
}

const CONFIG = "apps/realtime/wrangler.jsonc";
const PROTECTED = ["PageHub", "OrgHub"];

const raw = readFileSync(CONFIG, "utf8");
const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
	durable_objects?: { bindings?: { class_name: string }[] };
	migrations?: Migration[];
};

const failures: string[] = [];

for (const migration of config.migrations ?? []) {
	for (const name of migration.deleted_classes ?? []) {
		if (PROTECTED.includes(name)) {
			failures.push(
				`${CONFIG}: migration "${migration.tag}" deletes ${name}. That destroys every instance's storage and cannot be undone.`,
			);
		}
	}
	for (const rename of migration.renamed_classes ?? []) {
		if (PROTECTED.includes(rename.from)) {
			failures.push(
				`${CONFIG}: migration "${migration.tag}" renames ${rename.from}. Instances are addressed by class, so their storage is orphaned.`,
			);
		}
	}
}

const bound = (config.durable_objects?.bindings ?? []).map(
	(binding) => binding.class_name,
);
const created = (config.migrations ?? []).flatMap((migration) => [
	...(migration.new_sqlite_classes ?? []),
	...(migration.new_classes ?? []),
]);
for (const name of PROTECTED) {
	if (bound.includes(name) && !created.includes(name)) {
		failures.push(
			`${CONFIG}: ${name} is bound but no migration creates it, so a deploy will not provision it.`,
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log(
	`${CONFIG}: durable object classes are safe (${bound.join(", ")}).`,
);
