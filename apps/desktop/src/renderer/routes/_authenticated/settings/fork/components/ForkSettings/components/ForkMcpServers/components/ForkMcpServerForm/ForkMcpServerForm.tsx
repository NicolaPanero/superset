import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useId, useState } from "react";
import { HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import type { ForkMcpServerSummary } from "../../hooks/useForkMcp";

type Transport = ForkMcpServerSummary["transport"];

const TRANSPORTS: Array<{ value: Transport; label: string }> = [
	{ value: "http", label: "HTTP" },
	{ value: "sse", label: "SSE" },
	{ value: "stdio", label: "stdio" },
];

interface SecretRow {
	key: string;
	name: string;
	value: string;
	stored: boolean;
}

export type ForkMcpServerInput =
	| {
			transport: "stdio";
			name: string;
			enabled: boolean;
			command: string;
			args: string[];
			env: Array<{ name: string; value?: string }>;
	  }
	| {
			transport: "http" | "sse";
			name: string;
			enabled: boolean;
			url: string;
			headers: Array<{ name: string; value?: string }>;
	  };

export function ForkMcpServerForm({
	initial,
	pending,
	error,
	onSave,
	onCancel,
}: {
	initial?: ForkMcpServerSummary;
	pending: boolean;
	error: string | null;
	onSave: (server: ForkMcpServerInput) => void;
	onCancel: () => void;
}) {
	const { t } = useLingui();
	const id = useId();
	const [name, setName] = useState(initial?.name ?? "");
	const [transport, setTransport] = useState<Transport>(
		initial?.transport ?? "http",
	);
	const [url, setUrl] = useState(
		initial && initial.transport !== "stdio" ? initial.url : "",
	);
	const [command, setCommand] = useState(
		initial?.transport === "stdio" ? initial.command : "",
	);
	const [args, setArgs] = useState(
		initial?.transport === "stdio" ? initial.args.join("\n") : "",
	);
	const [secrets, setSecrets] = useState<SecretRow[]>(
		(initial?.secretNames ?? []).map((secret) => ({
			key: crypto.randomUUID(),
			name: secret,
			value: "",
			stored: true,
		})),
	);
	const updateSecret = (key: string, patch: Partial<SecretRow>) =>
		setSecrets((rows) =>
			rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
		);
	const secretEntries = secrets
		.filter((row) => row.name.trim())
		.map((row) => ({
			name: row.name.trim(),
			...(row.value ? { value: row.value } : {}),
		}));

	return (
		<form
			className="space-y-4 rounded-lg border bg-muted/20 p-4"
			onSubmit={(event) => {
				event.preventDefault();
				const base = { name: name.trim(), enabled: initial?.enabled ?? true };
				onSave(
					transport === "stdio"
						? {
								...base,
								transport,
								command: command.trim(),
								args: args
									.split("\n")
									.map((arg) => arg.trim())
									.filter(Boolean),
								env: secretEntries,
							}
						: { ...base, transport, url: url.trim(), headers: secretEntries },
				);
			}}
		>
			<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
				<div className="space-y-1">
					<Label htmlFor={`${id}-name`}>
						<Trans>Name</Trans>
					</Label>
					<Input
						id={`${id}-name`}
						required
						pattern="[A-Za-z0-9_\-]{1,64}"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="my-server"
					/>
				</div>
				<div className="space-y-1">
					<Label>
						<Trans>Type</Trans>
					</Label>
					<div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
						{TRANSPORTS.map((option) => (
							<Button
								key={option.value}
								type="button"
								size="sm"
								variant="ghost"
								aria-pressed={transport === option.value}
								className={cn(
									"h-7",
									transport === option.value &&
										"bg-background shadow-sm hover:bg-background",
								)}
								onClick={() => setTransport(option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
				</div>
			</div>
			{transport === "stdio" ? (
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor={`${id}-command`}>
							<Trans>Command</Trans>
						</Label>
						<Input
							id={`${id}-command`}
							required
							value={command}
							onChange={(event) => setCommand(event.target.value)}
							placeholder="npx"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`${id}-args`}>
							<Trans>Arguments</Trans>
						</Label>
						<Textarea
							id={`${id}-args`}
							rows={2}
							value={args}
							onChange={(event) => setArgs(event.target.value)}
							placeholder={t({ message: "One argument per line" })}
						/>
					</div>
				</div>
			) : (
				<div className="space-y-1">
					<Label htmlFor={`${id}-url`}>
						<Trans>URL</Trans>
					</Label>
					<Input
						id={`${id}-url`}
						type="url"
						required
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://mcp.example.com/"
					/>
				</div>
			)}
			<div className="space-y-2">
				<Label>
					{transport === "stdio" ? (
						<Trans>Environment variables</Trans>
					) : (
						<Trans>Headers</Trans>
					)}
				</Label>
				{secrets.map((row) => (
					<div key={row.key} className="flex items-center gap-2">
						<Input
							aria-label={t({ message: "Name" })}
							className="w-2/5 font-mono text-xs"
							value={row.name}
							onChange={(event) =>
								updateSecret(row.key, { name: event.target.value })
							}
							placeholder="Authorization"
						/>
						<Input
							aria-label={t({ message: "Value" })}
							type="password"
							autoComplete="off"
							className="flex-1 font-mono text-xs"
							required={!row.stored}
							value={row.value}
							onChange={(event) =>
								updateSecret(row.key, { value: event.target.value })
							}
							placeholder={
								row.stored
									? t({ message: "Unchanged" })
									: t({ message: "Value" })
							}
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-8 shrink-0"
							aria-label={t({ message: "Remove" })}
							onClick={() =>
								setSecrets((rows) =>
									rows.filter((item) => item.key !== row.key),
								)
							}
						>
							<HiOutlineXMark className="size-4" />
						</Button>
					</div>
				))}
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="h-7 gap-1 px-2 text-xs"
					onClick={() =>
						setSecrets((rows) => [
							...rows,
							{ key: crypto.randomUUID(), name: "", value: "", stored: false },
						])
					}
				>
					<HiOutlinePlus className="size-3.5" />
					<Trans>Add</Trans>
				</Button>
			</div>
			{error && (
				<p role="alert" className="break-words text-xs text-destructive">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<Button size="sm" disabled={pending}>
					<Trans>Save</Trans>
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					<Trans>Cancel</Trans>
				</Button>
			</div>
		</form>
	);
}
