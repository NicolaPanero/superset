import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkProviderId } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FaBitbucket, FaGithub, FaJira } from "react-icons/fa";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import { ForkSegmentedControl } from "renderer/components/ForkSegmentedControl";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog } from "renderer/routes/_authenticated/onboarding/components/GhAuthDialog";
import { useForkConnections } from "../../hooks/useForkConnections";
import { useForkGithubDiscovery } from "../../hooks/useForkGithubDiscovery";
import { ForkGithubCliSetup } from "./components/ForkGithubCliSetup";
import { ForkJiraStatusMapping } from "./components/ForkJiraStatusMapping";
import { ForkTimesheetSettings } from "./components/ForkTimesheetSettings";

export function ForkConnectionCard({
	provider,
	brokerUrl,
	onOAuth,
	onSetupOAuth,
}: {
	provider: ForkProviderId;
	brokerUrl: string;
	onOAuth: (providers: ForkProviderId[], connectionId?: string) => void;
	onSetupOAuth: () => void;
}) {
	const { t } = useLingui();
	const gh = electronTrpc.system.detectGhCli.useQuery(undefined, {
		enabled: provider === "github",
		refetchOnWindowFocus: true,
	});
	const brew = electronTrpc.system.detectBrew.useQuery(undefined, {
		enabled: provider === "github",
		refetchOnWindowFocus: true,
	});
	const { client, connections, refresh, data } = useForkConnections();
	const rows = connections.filter((c) => c.provider === provider);
	const [selected, setSelected] = useState<string | null>(null);
	const current =
		rows.find((c) => c.id === selected) ??
		rows.find((c) => c.enabled && c.isDefault) ??
		rows.find((c) => c.enabled && c.mode !== "system") ??
		rows[0];
	const discovery = useForkGithubDiscovery(
		provider === "github" ? current : undefined,
	);
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
		networkMode: "always",
		retry: false,
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
			current?.mode === "system" ||
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
	const expired = current?.state === "expired";
	const showForm = editing || add;
	const needsGhCli = provider === "github" && gh.data?.installed === false;
	const openForm = (adding: boolean) => {
		setConfirmation(false);
		setAdd(adding);
		setEditing(!adding);
		setMode(!adding && current?.mode === "oauth" ? "oauth" : "token");
	};
	const closeForm = () => {
		setEditing(false);
		setAdd(false);
		setToken("");
	};
	const connectGithub = () => {
		if (gh.data?.authenticated) action.mutate("enable");
		else if (!gh.data?.installed && !brew.data?.installed)
			window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
		else setGhOpen(true);
	};
	const status = discovery.isFetching
		? { tone: "bg-muted-foreground/40", label: t({ message: "Checking…" }) }
		: connected
			? { tone: "bg-emerald-500", label: t({ message: "Connected" }) }
			: expired
				? { tone: "bg-amber-500", label: t({ message: "Expired" }) }
				: current?.error
					? { tone: "bg-destructive", label: t({ message: "Error" }) }
					: {
							tone: "bg-muted-foreground/40",
							label: t({ message: "Not connected" }),
						};
	const method =
		current?.mode === "system"
			? current.source
			: current?.mode === "oauth"
				? "OAuth"
				: current
					? t({ message: "API token" })
					: null;
	const details = connected
		? [
				current?.identity?.login ? `@${current.identity.login}` : null,
				provider === "jira" ? (current?.site ?? null) : null,
				method,
			]
		: [
				provider === "jira"
					? t({ message: "Tasks and projects" })
					: t({ message: "Repositories and pull requests" }),
			];
	return (
		<section className="px-5 py-4" aria-label={title}>
			<div className="flex items-center gap-4">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
					<Icon className="size-[18px]" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h4 className="text-sm font-medium">{title}</h4>
						<span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
							<span className={cn("size-1.5 rounded-full", status.tone)} />
							{status.label}
						</span>
						{current?.isDefault && rows.length > 1 && (
							<span className="text-[11px] text-muted-foreground">
								<Trans>Default</Trans>
							</span>
						)}
					</div>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{details.filter(Boolean).join(" · ")}
					</p>
				</div>
				{rows.length > 1 && (
					<select
						aria-label={t({ message: "Account" })}
						className="h-8 max-w-44 rounded-md border bg-background px-2 text-xs"
						value={current?.id}
						onChange={(e) => {
							setSelected(e.target.value);
							closeForm();
						}}
					>
						{rows.map((c) => (
							<option key={c.id} value={c.id}>
								{c.identity?.login ?? c.label}
							</option>
						))}
					</select>
				)}
				{!showForm &&
					!connected &&
					!needsGhCli &&
					(provider === "github" ? (
						<Button
							size="sm"
							disabled={
								!client ||
								action.isPending ||
								gh.isPending ||
								brew.isPending ||
								discovery.isFetching
							}
							onClick={connectGithub}
						>
							{gh.isPending || brew.isPending || discovery.isFetching ? (
								<Trans>Checking…</Trans>
							) : gh.data?.authenticated ? (
								<Trans>Use local GitHub account</Trans>
							) : gh.data?.installed ? (
								<Trans>Connect GitHub repositories</Trans>
							) : (
								<Trans>Install GitHub CLI</Trans>
							)}
						</Button>
					) : (
						<Button size="sm" onClick={() => openForm(!current)}>
							{expired ? <Trans>Reconnect</Trans> : <Trans>Connect</Trans>}
						</Button>
					))}
				{current && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="size-8"
								aria-label={t({ message: "More actions" })}
							>
								<HiEllipsisHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{current.enabled && (
								<DropdownMenuItem
									disabled={action.isPending}
									onSelect={() => action.mutate("verify")}
								>
									<Trans>Verify</Trans>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onSelect={() => openForm(false)}>
								<Trans>Configure</Trans>
							</DropdownMenuItem>
							{current.enabled &&
								rows.filter((c) => c.enabled).length > 1 &&
								!current.isDefault && (
									<DropdownMenuItem
										disabled={action.isPending}
										onSelect={() => action.mutate("default")}
									>
										<Trans>Set as default</Trans>
									</DropdownMenuItem>
								)}
							<DropdownMenuItem onSelect={() => openForm(true)}>
								<Trans>Add account</Trans>
							</DropdownMenuItem>
							{current.enabled && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onSelect={() => {
											closeForm();
											setConfirmation(true);
										}}
									>
										<Trans>Disconnect</Trans>
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			{needsGhCli && !showForm && (
				<ForkGithubCliSetup
					brewAvailable={brew.isPending ? undefined : !!brew.data?.installed}
					busy={
						!client || action.isPending || gh.isFetching || discovery.isFetching
					}
					onInstall={connectGithub}
					onCheck={() => {
						void gh.refetch();
						void brew.refetch();
						if (current?.mode === "system" && current.enabled && !connected)
							void discovery.refetch({ cancelRefetch: false });
					}}
				/>
			)}
			{current?.error && !showForm && !discovery.isFetching && (
				<p className="mt-2 break-words pl-13 text-xs text-destructive">
					{current.error}
				</p>
			)}
			{showForm && (
				<form
					className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4 sm:ml-13"
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
					<ForkSegmentedControl
						className="w-56"
						value={mode}
						onChange={setMode}
						segments={[
							{ value: "token", label: <Trans>API token</Trans> },
							{ value: "oauth", label: "OAuth" },
						]}
					/>
					{mode === "token" ? (
						<div className="grid gap-3 sm:grid-cols-2">
							{provider === "jira" && (
								<div className="space-y-1 sm:col-span-2">
									<Label htmlFor={`${provider}-site`}>
										<Trans>Site URL</Trans>
									</Label>
									<Input
										id={`${provider}-site`}
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
									<Label htmlFor={`${provider}-email`}>
										<Trans>Email</Trans>
									</Label>
									<Input
										id={`${provider}-email`}
										type="email"
										required
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										autoComplete="username"
									/>
								</div>
							)}
							<div
								className={cn(
									"space-y-1",
									provider === "github" && "sm:col-span-2",
								)}
							>
								<Label htmlFor={`${provider}-token`}>
									<Trans>API token</Trans>
								</Label>
								<Input
									id={`${provider}-token`}
									type="password"
									required
									value={token}
									onChange={(e) => setToken(e.target.value)}
									autoComplete="off"
								/>
							</div>
						</div>
					) : brokerUrl ? (
						<p className="truncate text-xs text-muted-foreground">
							{brokerUrl}
						</p>
					) : (
						<button
							type="button"
							className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
							onClick={onSetupOAuth}
						>
							<Trans>Configure the OAuth service below.</Trans>
						</button>
					)}
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							disabled={action.isPending || (mode === "oauth" && !brokerUrl)}
						>
							<Trans>Connect</Trans>
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={closeForm}>
							<Trans>Cancel</Trans>
						</Button>
						<a
							className="ml-auto text-xs text-muted-foreground hover:text-foreground"
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
					</div>
				</form>
			)}
			{provider === "jira" && current?.enabled && (data?.version ?? 0) >= 8 && (
				<ForkJiraStatusMapping connectionId={current.id} />
			)}
			{provider === "jira" && current?.enabled && (data?.version ?? 0) >= 9 && (
				<ForkTimesheetSettings connectionId={current.id} />
			)}
			{confirmation && (
				<div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4 text-sm sm:ml-13">
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
				<p
					role="alert"
					className="mt-2 break-words text-xs text-destructive sm:pl-13"
				>
					{action.error.message}
				</p>
			)}
			<GhAuthDialog
				open={ghOpen}
				mode={gh.data?.installed ? "auth" : "install"}
				onOpenChange={setGhOpen}
				onExit={() => {
					void gh.refetch();
					action.mutate("enable");
				}}
			/>
		</section>
	);
}
