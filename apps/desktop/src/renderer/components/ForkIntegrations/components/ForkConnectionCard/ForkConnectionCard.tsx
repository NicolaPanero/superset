import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkProviderId } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FaBitbucket, FaGithub, FaJira } from "react-icons/fa";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog } from "renderer/routes/_authenticated/onboarding/components/GhAuthDialog";
import { useForkConnections } from "../../hooks/useForkConnections";

export function ForkConnectionCard({
	provider,
	brokerUrl,
	onOAuth,
}: {
	provider: ForkProviderId;
	brokerUrl: string;
	onOAuth: (providers: ForkProviderId[], connectionId?: string) => void;
}) {
	const { t } = useLingui();
	const gh = electronTrpc.system.detectGhCli.useQuery(undefined, {
		enabled: provider === "github",
	});
	const brew = electronTrpc.system.detectBrew.useQuery(undefined, {
		enabled: provider === "github",
	});
	const { client, connections, refresh } = useForkConnections();
	const rows = connections.filter((c) => c.provider === provider);
	const [selected, setSelected] = useState<string | null>(null);
	const current =
		rows.find((c) => c.id === selected) ??
		rows.find((c) => c.enabled && c.isDefault) ??
		rows.find((c) => c.enabled && c.mode !== "system") ??
		rows[0];
	const [editing, setEditing] = useState(false),
		[add, setAdd] = useState(false),
		[ghOpen, setGhOpen] = useState(false);
	const [mode, setMode] = useState<"token" | "oauth">("token");
	const [email, setEmail] = useState(""),
		[token, setToken] = useState(""),
		[site, setSite] = useState("");
	const [logoutCli, setLogoutCli] = useState(false);
	const [confirmation, setConfirmation] = useState(false);
	const action = useMutation({
		mutationFn: async (
			kind: "save" | "verify" | "disconnect" | "enable" | "default",
		) => {
			if (!client) throw new Error(t({ message: "Host unavailable" }));
			if (kind === "save") {
				const result = await client.forkConnections.saveToken.mutate({
					provider,
					id: add || current?.mode !== "token" ? undefined : current.id,
					token,
					email: email || undefined,
					site: site || current?.site || undefined,
				});
				setToken("");
				setEmail("");
				setSite("");
				setSelected(result.id);
				setEditing(false);
				setAdd(false);
				return result;
			}
			if (kind === "enable")
				return client.forkConnections.enableSystemGithub.mutate();
			if (!current) return;
			if (kind === "default")
				return client.forkConnections.setDefault.mutate({ id: current.id });
			if (kind === "verify")
				return client.forkConnections.verify.mutate({ id: current.id });
			return client.forkConnections.disconnect.mutate({
				id: current.id,
				logoutCli,
			});
		},
		onSettled: () => void refresh(),
		onSuccess: () => {
			setConfirmation(false);
		},
	});
	const discovered = useRef(false);
	useEffect(() => {
		if (
			provider !== "github" ||
			discovered.current ||
			!client ||
			!current?.enabled ||
			current.verifiedAt
		)
			return;
		discovered.current = true;
		action.mutate("verify");
	}, [provider, client, current, action.mutate]);
	const Icon =
		provider === "github"
			? FaGithub
			: provider === "bitbucket"
				? FaBitbucket
				: FaJira;
	const title =
		provider === "github"
			? "GitHub"
			: provider === "bitbucket"
				? "Bitbucket"
				: "Jira";
	const connected = current?.enabled && current.state === "connected";
	const showForm = editing || add;
	return (
		<section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-background p-5">
			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
					<Icon className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="font-medium">{title}</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						{provider === "jira" ? (
							<Trans>Tasks and projects</Trans>
						) : (
							<Trans>Repositories and pull requests</Trans>
						)}
					</p>
				</div>
				<span
					className={
						connected
							? "size-2 rounded-full bg-emerald-500"
							: "size-2 rounded-full bg-muted-foreground/40"
					}
				/>
			</div>
			{rows.length > 1 && (
				<select
					aria-label={t({ message: "Account" })}
					className="h-9 rounded-md border bg-background px-2 text-sm"
					value={current?.id}
					onChange={(e) => {
						setSelected(e.target.value);
						setEditing(false);
						setAdd(false);
					}}
				>
					{rows.map((c) => (
						<option key={c.id} value={c.id}>
							{c.identity?.login ?? c.label} · {c.mode}
						</option>
					))}
				</select>
			)}
			{!current && !showForm && (
				<p className="text-sm text-muted-foreground">
					<Trans>Not connected</Trans>
				</p>
			)}
			{current && !showForm && (
				<div className="space-y-1 text-sm">
					<p className="truncate font-medium">
						{current.identity?.login ? (
							"@" + current.identity.login
						) : (
							<Trans>Not connected</Trans>
						)}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{current.site ??
							current.brokerUrl ??
							(current.mode === "system"
								? t({ message: "This computer" })
								: title)}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{current.mode === "system"
							? current.source
							: current.mode === "oauth"
								? "OAuth"
								: t({ message: "API token" })}
					</p>
					{current.state === "expired" && (
						<p className="text-xs text-amber-600">
							<Trans>Reconnect account</Trans>
						</p>
					)}
					{current.error && (
						<p className="break-words text-xs text-destructive">
							{current.error}
						</p>
					)}
				</div>
			)}
			{showForm && (
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (mode === "oauth")
							onOAuth(
								[provider],
								!add && current?.mode === "oauth" ? current.id : undefined,
							);
						else action.mutate("save");
					}}
				>
					<div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
						<Button
							type="button"
							size="sm"
							variant={mode === "token" ? "secondary" : "ghost"}
							onClick={() => setMode("token")}
						>
							<Trans>API token</Trans>
						</Button>
						<Button
							type="button"
							size="sm"
							variant={mode === "oauth" ? "secondary" : "ghost"}
							onClick={() => setMode("oauth")}
						>
							OAuth
						</Button>
					</div>
					{mode === "token" ? (
						<>
							{provider === "jira" && (
								<div className="space-y-1">
									<Label htmlFor={provider + "-site"}>
										<Trans>Site URL</Trans>
									</Label>
									<Input
										id={provider + "-site"}
										type="url"
										required
										value={site || current?.site || ""}
										onChange={(e) => setSite(e.target.value)}
										placeholder="https://example.atlassian.net"
									/>
								</div>
							)}
							{provider !== "github" && (
								<div className="space-y-1">
									<Label htmlFor={provider + "-email"}>
										<Trans>Email</Trans>
									</Label>
									<Input
										id={provider + "-email"}
										type="email"
										required
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										autoComplete="username"
									/>
								</div>
							)}
							<div className="space-y-1">
								<Label htmlFor={provider + "-token"}>
									<Trans>API token</Trans>
								</Label>
								<Input
									id={provider + "-token"}
									type="password"
									required
									value={token}
									onChange={(e) => setToken(e.target.value)}
									autoComplete="off"
								/>
							</div>
						</>
					) : (
						<p className="text-xs text-muted-foreground">
							{brokerUrl || <Trans>Configure the OAuth service below.</Trans>}
						</p>
					)}
					<a
						className="inline-block text-xs text-primary"
						href={
							provider === "github"
								? "https://github.com/settings/tokens"
								: provider === "jira"
									? "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/"
									: "https://support.atlassian.com/bitbucket-cloud/docs/api-tokens/"
						}
						target="_blank"
						rel="noreferrer"
					>
						<Trans>Documentation</Trans>
					</a>
					<div className="flex gap-2">
						<Button
							size="sm"
							disabled={action.isPending || (mode === "oauth" && !brokerUrl)}
						>
							<Trans>Connect</Trans>
						</Button>
						{(editing || add) && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => {
									setEditing(false);
									setAdd(false);
									setToken("");
								}}
							>
								<Trans>Cancel</Trans>
							</Button>
						)}
					</div>
				</form>
			)}
			{!showForm && (
				<div className="mt-auto flex flex-wrap gap-2">
					{provider === "github" && (!current?.enabled || !connected) && (
						<Button
							size="sm"
							disabled={!client}
							onClick={() => {
								if (!gh.data?.installed && !brew.data?.installed)
									window.open(
										"https://cli.github.com/",
										"_blank",
										"noopener,noreferrer",
									);
								else setGhOpen(true);
							}}
						>
							<Trans>Connect GitHub</Trans>
						</Button>
					)}
					{current?.enabled && (
						<Button
							size="sm"
							variant="outline"
							disabled={action.isPending}
							onClick={() => action.mutate("verify")}
						>
							<Trans>Verify</Trans>
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							setEditing(true);
							setMode(current?.mode === "oauth" ? "oauth" : "token");
						}}
					>
						{current ? <Trans>Configure</Trans> : <Trans>Connect</Trans>}
					</Button>
					{current?.enabled &&
						rows.filter((c) => c.enabled).length > 1 &&
						!current.isDefault && (
							<Button
								size="sm"
								variant="outline"
								disabled={action.isPending}
								onClick={() => action.mutate("default")}
							>
								<Trans>Set as default</Trans>
							</Button>
						)}
					{current?.enabled && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setConfirmation(true)}
						>
							<Trans>Disconnect</Trans>
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							setAdd(true);
							setMode("token");
						}}
					>
						<Trans>Add account</Trans>
					</Button>
				</div>
			)}
			{confirmation && (
				<div className="space-y-3 rounded-lg border p-3 text-sm">
					<p>
						<Trans>Disconnect this account from Superset?</Trans>
					</p>
					{current?.mode === "system" && (
						<label className="flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={logoutCli}
								onChange={(e) => setLogoutCli(e.target.checked)}
							/>
							<Trans>Also sign out of GitHub CLI on this computer</Trans>
						</label>
					)}
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="destructive"
							disabled={action.isPending}
							onClick={() => action.mutate("disconnect")}
						>
							<Trans>Disconnect</Trans>
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setConfirmation(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
					</div>
				</div>
			)}
			{action.isError && (
				<p role="alert" className="break-words text-xs text-destructive">
					{action.error.message}
				</p>
			)}
			<GhAuthDialog
				open={ghOpen}
				mode={gh.data?.installed ? "auth" : "install"}
				onOpenChange={setGhOpen}
				onExit={() => action.mutate("enable")}
			/>
		</section>
	);
}
