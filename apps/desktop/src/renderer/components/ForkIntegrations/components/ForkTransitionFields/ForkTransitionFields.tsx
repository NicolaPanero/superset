import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { Checkbox } from "@superset/ui/checkbox";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { ForkTransitionUserPicker } from "./components/ForkTransitionUserPicker/ForkTransitionUserPicker";

export interface TransitionField {
	id: string;
	name: string;
	required: boolean;
	schema?: { type: string; items?: string; custom?: string };
	allowedValues?: { id?: string; name?: string; value?: string }[];
}

export function ForkTransitionFields({
	fields,
	values,
	onChange,
	task,
}: {
	fields: TransitionField[];
	values: Record<string, unknown>;
	onChange: (values: Record<string, unknown>) => void;
	task?: ForkTask | null;
}) {
	const { t } = useLingui();
	return (
		<div className="space-y-5">
			{fields.map((field) => {
				const value = values[field.id];
				const id = `jira-transition-${field.id}`;
				const update = (next: unknown) =>
					onChange({ ...values, [field.id]: next });
				const multiple = field.schema?.type === "array";
				const serialize = (selected: string) =>
					field.schema?.type === "string" || field.schema?.items === "string"
						? selected
						: { id: selected };
				const choice = (option: {
					id?: string;
					name?: string;
					value?: string;
				}) => option.id ?? option.value ?? option.name ?? "";
				const selected = Array.isArray(value)
					? value.map((v) => String((v as { id?: string })?.id ?? v))
					: [];
				const complex =
					field.schema?.custom?.endsWith(":cascadingselect") ||
					["datetime", "issuelink", "timetracking", "attachment"].includes(
						field.schema?.type ?? "",
					);
				return (
					<div key={field.id} className="space-y-2">
						<Label htmlFor={id} className="text-xs font-medium">
							{field.name}
							{field.required ? " *" : ""}
						</Label>
						{complex ? (
							<p className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
								<Trans>This field must be completed in Jira.</Trans>
							</p>
						) : field.schema?.type === "user" && task ? (
							<ForkTransitionUserPicker
								task={task}
								id={id}
								value={value}
								onChange={update}
							/>
						) : field.allowedValues?.length ? (
							multiple ? (
								<fieldset
									id={id}
									aria-label={field.name}
									className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2"
								>
									{field.allowedValues.map((option) => {
										const key = choice(option);
										return (
											<label
												key={key}
												htmlFor={`${id}-${key}`}
												className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/40"
											>
												<Checkbox
													id={`${id}-${key}`}
													checked={selected.includes(key)}
													onCheckedChange={(checked) =>
														update(
															(checked
																? [...selected, key]
																: selected.filter((v) => v !== key)
															).map(serialize),
														)
													}
												/>
												<span>{option.name ?? option.value ?? option.id}</span>
											</label>
										);
									})}
								</fieldset>
							) : (
								<Select
									value={String(
										(value as { id?: string } | undefined)?.id ?? value ?? "",
									)}
									onValueChange={(v) => update(serialize(v))}
								>
									<SelectTrigger id={id} className="w-full bg-background">
										<SelectValue
											placeholder={t({ message: "Select an option" })}
										/>
									</SelectTrigger>
									<SelectContent>
										{field.allowedValues.map((option) => (
											<SelectItem key={choice(option)} value={choice(option)}>
												{option.name ?? option.value ?? option.id}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)
						) : field.schema?.custom?.endsWith(":textarea") ||
							field.id === "description" ? (
							<Textarea
								id={id}
								required={field.required}
								className="min-h-28 resize-y"
								value={typeof value === "string" ? value : ""}
								onChange={(e) => update(e.target.value)}
							/>
						) : (
							<Input
								id={id}
								required={field.required}
								type={
									field.schema?.type === "number" ||
									field.schema?.type === "integer"
										? "number"
										: field.schema?.type === "date"
											? "date"
											: "text"
								}
								step={field.schema?.type === "integer" ? "1" : "any"}
								value={
									typeof value === "string" || typeof value === "number"
										? value
										: multiple
											? selected.join(", ")
											: ""
								}
								onChange={(e) =>
									update(
										field.schema?.type === "number" ||
											field.schema?.type === "integer"
											? e.target.value === ""
												? undefined
												: e.target.valueAsNumber
											: multiple
												? e.target.value
														.split(",")
														.map((v) => v.trim())
														.filter(Boolean)
												: e.target.value,
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
