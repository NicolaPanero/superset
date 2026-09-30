import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useState } from "react";
import {
	LuCheck,
	LuExternalLink,
	LuKeyRound,
	LuPlus,
	LuUnplug,
} from "react-icons/lu";
import { useConnector } from "./hooks/useConnector";

interface ConnectorSectionProps {
	slug: string;
	organizationId?: string | null;
	onConnected?: () => void;
}

export function ConnectorSection({
	slug,
	organizationId,
	onConnected,
}: ConnectorSectionProps) {
	const { t } = useLingui();
	const {
		connector,
		connections,
		isPending,
		connectApiKey,
		disconnect,
		openOAuth,
		organizationId: resolvedOrganizationId,
	} = useConnector(slug, organizationId, onConnected);

	const [selected, setSelected] = useState<string | null>(null);
	const [values, setValues] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [addingAccount, setAddingAccount] = useState(false);

	if (isPending || !connector) {
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>Loading…</Trans>
			</p>
		);
	}

	const connected = connections.length > 0 && (
		<div className="w-full min-w-0 divide-y divide-border/40 rounded-lg border border-border/60">
			{connections.map((connection) => {
				const who = connection.externalUserLabel;
				const where = connection.externalAccountLabel;
				return (
					<div
						key={connection.id}
						className="flex w-full min-w-0 items-center gap-2 px-3 py-2"
					>
						<Badge variant="secondary" className="shrink-0 gap-1">
							<LuCheck className="size-3" />
							<Trans>Connected</Trans>
						</Badge>
						<span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
							{who && where ? `${who} · ${where}` : (who ?? where ?? "")}
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0"
							disabled={disconnect.isPending}
							aria-label={t({ message: `Disconnect ${who ?? where ?? ""}` })}
							onClick={() => disconnect.mutate({ connectionId: connection.id })}
						>
							<LuUnplug className="size-3.5" />
						</Button>
					</div>
				);
			})}
		</div>
	);

	if (connections.length > 0 && !addingAccount) {
		return (
			<div className="w-full min-w-0 space-y-3">
				{connected}
				{connector.scope === "user" && (
					<Button
						variant="outline"
						size="sm"
						className="w-full"
						onClick={() => {
							setError(null);
							setAddingAccount(true);
						}}
					>
						<LuPlus className="mr-1.5 size-3.5" />
						<Trans>Connect another account</Trans>
					</Button>
				)}
			</div>
		);
	}

	const method =
		connector.methods.find((entry) => entry.type === selected) ??
		connector.methods[0];
	if (!method) return null;

	return (
		<div className="w-full min-w-0 space-y-4">
			{connected}

			{connector.methods.length > 1 && (
				<Select
					value={method.type}
					onValueChange={(value) => {
						setSelected(value);
						setError(null);
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{connector.methods.map((entry) => (
							<SelectItem key={entry.type} value={entry.type}>
								{entry.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{method.type === "api_key" ? (
				<form
					className="space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						setError(null);
						connectApiKey.mutate(
							{ organizationId: resolvedOrganizationId, slug, inputs: values },
							{ onError: (e) => setError(errorMessage(e)) },
						);
					}}
				>
					{method.inputs.map((field) => (
						<div key={field.name} className="space-y-1.5">
							<Input
								type={field.secret ? "password" : "text"}
								placeholder={field.placeholder ?? field.label ?? field.name}
								required={field.required}
								value={values[field.name] ?? ""}
								onChange={(event) =>
									setValues({ ...values, [field.name]: event.target.value })
								}
							/>
							{field.description && (
								<p className="text-xs text-muted-foreground">
									{field.description}
								</p>
							)}
						</div>
					))}
					<Button
						type="submit"
						className="w-full"
						disabled={connectApiKey.isPending}
					>
						<LuKeyRound className="mr-1.5 size-3.5" />
						{connectApiKey.isPending ? (
							<Trans>Connecting…</Trans>
						) : (
							t({ message: `Continue to ${connector.displayName}` })
						)}
					</Button>
				</form>
			) : (
				<Button className="w-full" onClick={() => openOAuth(method.type)}>
					{t({ message: `Continue to ${connector.displayName}` })}
					<LuExternalLink className="ml-1.5 size-3.5" />
				</Button>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			{addingAccount && (
				<Button
					variant="ghost"
					size="sm"
					className="w-full"
					onClick={() => setAddingAccount(false)}
				>
					<Trans>Cancel</Trans>
				</Button>
			)}
		</div>
	);
}
