import { TRPCError } from "@trpc/server";
import { markdownToAdf } from "./fork-adf";

interface Field {
	id: string;
	name: string;
	schema?: { custom?: string };
}

export function forkJiraTransitionFields(
	values: Record<string, unknown>,
	fields: Field[],
) {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => {
			const field = fields.find((entry) => entry.id === key);
			return [
				key,
				typeof value === "string" &&
				(key === "description" || field?.schema?.custom?.endsWith(":textarea"))
					? markdownToAdf(value)
					: value,
			];
		}),
	);
}

export function forkJiraTransitionError(
	error: unknown,
	fields: Field[],
): unknown {
	if (!(error instanceof TRPCError)) return error;
	const cause = error.cause as { errors?: Record<string, string> } | undefined;
	if (!cause?.errors) return error;
	let message = error.message;
	for (const [id, detail] of Object.entries(cause.errors)) {
		const field = fields.find((entry) => entry.id === id);
		if (field)
			message = message.replace(`${id}: ${detail}`, `${field.name}: ${detail}`);
	}
	return new TRPCError({ code: error.code, message, cause: error.cause });
}
