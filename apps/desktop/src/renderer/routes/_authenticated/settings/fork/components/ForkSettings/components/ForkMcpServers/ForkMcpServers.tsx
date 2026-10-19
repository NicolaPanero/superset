import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import {
	ForkMcpServerForm,
	type ForkMcpServerInput,
} from "./components/ForkMcpServerForm";
import { ForkMcpServerRow } from "./components/ForkMcpServerRow";
import { useForkMcp } from "./hooks/useForkMcp";

const NEW_SERVER = Symbol("new");

export function ForkMcpServers() {
	const { t } = useLingui();
	const { client, data, isError, isPending, refresh } = useForkMcp();
	const [editing, setEditing] = useState<string | typeof NEW_SERVER | null>(
		null,
	);
	const [deleting, setDeleting] = useState<string | null>(null);
	const host = () => {
		if (!client) throw new Error(t({ message: "Host unavailable" }));
		return client;
	};
	const save = useMutation({
		mutationFn: (server: ForkMcpServerInput) =>
			host().forkMcp.save.mutate({
				originalName: typeof editing === "string" ? editing : undefined,
				server,
			}),
		onSuccess: () => {
			setEditing(null);
			void refresh();
		},
	});
	const toggle = useMutation({
		mutationFn: (input: { name: string; enabled: boolean }) =>
			host().forkMcp.setEnabled.mutate(input),
		onSettled: () => void refresh(),
	});
	const remove = useMutation({
		mutationFn: (name: string) => host().forkMcp.remove.mutate({ name }),
		onSuccess: () => {
			setDeleting(null);
			void refresh();
		},
	});
	const openForm = (target: string | typeof NEW_SERVER) => {
		save.reset();
		setDeleting(null);
		setEditing(target);
	};

	if (isError || !client)
		return (
			<div className="rounded-lg border p-4 text-sm text-muted-foreground">
				<Trans>Update this host to configure integrations.</Trans>
			</div>
		);
	const servers = data?.servers ?? [];
	return (
		<section className="space-y-3" data-testid="fork-mcp-servers">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h3 className="text-base font-semibold">
						<Trans>MCP servers</Trans>
					</h3>
					<p className="mt-0.5 text-xs text-muted-foreground">
						<Trans>Shared by every agent and account on this computer.</Trans>
					</p>
				</div>
				{editing === null && (
					<Button
						size="sm"
						variant="outline"
						className="gap-1"
						onClick={() => openForm(NEW_SERVER)}
					>
						<HiOutlinePlus className="size-3.5" />
						<Trans>Add server</Trans>
					</Button>
				)}
			</div>
			{editing === NEW_SERVER && (
				<ForkMcpServerForm
					pending={save.isPending}
					error={save.error?.message ?? null}
					onSave={(server) => save.mutate(server)}
					onCancel={() => setEditing(null)}
				/>
			)}
			<div className="divide-y rounded-lg border">
				{isPending && (
					<p className="px-5 py-4 text-sm text-muted-foreground">
						<Trans>Loading...</Trans>
					</p>
				)}
				{!isPending && servers.length === 0 && (
					<p className="px-5 py-4 text-sm text-muted-foreground">
						<Trans>No MCP servers yet.</Trans>
					</p>
				)}
				{servers.map((server) => (
					<div key={server.name}>
						<ForkMcpServerRow
							server={server}
							pending={toggle.isPending}
							onToggle={(enabled) =>
								toggle.mutate({ name: server.name, enabled })
							}
							onEdit={() => openForm(server.name)}
							onDelete={() => {
								setEditing(null);
								setDeleting(server.name);
							}}
						/>
						{editing === server.name && (
							<div className="px-5 pb-4">
								<ForkMcpServerForm
									initial={server}
									pending={save.isPending}
									error={save.error?.message ?? null}
									onSave={(next) => save.mutate(next)}
									onCancel={() => setEditing(null)}
								/>
							</div>
						)}
						{deleting === server.name && (
							<div className="mx-5 mb-4 space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
								<p>
									<Trans>Delete {server.name}?</Trans>
								</p>
								{remove.error && (
									<p role="alert" className="text-xs text-destructive">
										{remove.error.message}
									</p>
								)}
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="destructive"
										disabled={remove.isPending}
										onClick={() => remove.mutate(server.name)}
									>
										<Trans>Delete</Trans>
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDeleting(null)}
									>
										<Trans>Cancel</Trans>
									</Button>
								</div>
							</div>
						)}
					</div>
				))}
			</div>
			{data?.path && (
				<p className="truncate text-[11px] text-muted-foreground">
					<Trans>Stored in {data.path}</Trans>
				</p>
			)}
		</section>
	);
}
