import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";

interface TransitionField {
	id: string;
	name: string;
	required: boolean;
	schema?: { type: string; items?: string };
	allowedValues?: { id?: string; name?: string; value?: string }[];
}
export function ForkTransitionFields({
	fields,
	values,
	onChange,
}: {
	fields: TransitionField[];
	values: Record<string, unknown>;
	onChange: (values: Record<string, unknown>) => void;
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{fields.map((field) => {
				const value = values[field.id];
				const update = (next: unknown) =>
					onChange({ ...values, [field.id]: next });
				const multiple = field.schema?.type === "array";
				return (
					<div key={field.id} className="space-y-1">
						<Label htmlFor={`jira-transition-${field.id}`}>
							{field.name}
							{field.required ? " *" : ""}
						</Label>
						{field.allowedValues?.length ? (
							<select
								id={`jira-transition-${field.id}`}
								required={field.required}
								multiple={multiple}
								className="min-h-9 w-full rounded-md border bg-background px-2 text-sm"
								value={
									multiple
										? Array.isArray(value)
											? value.map((v) => String((v as { id?: string }).id ?? v))
											: []
										: String(
												(value as { id?: string } | undefined)?.id ??
													value ??
													"",
											)
								}
								onChange={(event) => {
									const selected = Array.from(event.target.selectedOptions)
										.map((option) => option.value)
										.filter(Boolean);
									const serialize = (selectedValue: string) =>
										field.schema?.type === "string" ||
										field.schema?.items === "string"
											? selectedValue
											: { id: selectedValue };
									update(
										multiple
											? selected.map(serialize)
											: selected[0]
												? serialize(selected[0])
												: undefined,
									);
								}}
							>
								{!multiple && <option value="" />}
								{field.allowedValues.map((option, index) => (
									<option
										key={option.id ?? index}
										value={option.id ?? option.value ?? option.name}
									>
										{option.name ?? option.value ?? option.id}
									</option>
								))}
							</select>
						) : (
							<Input
								id={`jira-transition-${field.id}`}
								required={field.required}
								type={
									field.schema?.type === "number"
										? "number"
										: field.schema?.type === "date"
											? "date"
											: "text"
								}
								value={
									typeof value === "string" || typeof value === "number"
										? value
										: ""
								}
								onChange={(event) =>
									update(
										field.schema?.type === "number"
											? Number(event.target.value)
											: multiple
												? event.target.value
														.split(",")
														.map((v) => v.trim())
														.filter(Boolean)
												: event.target.value,
									)
								}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
