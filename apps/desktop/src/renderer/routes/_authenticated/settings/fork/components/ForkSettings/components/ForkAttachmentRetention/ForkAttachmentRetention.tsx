import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";

const MAX_DAYS = 3650;

export function ForkAttachmentRetention() {
	const { t } = useLingui();
	const hostUrl = useContext(LocalHostServiceContext)?.activeHostUrl ?? null;
	const client = hostUrl ? getHostServiceClientByUrl(hostUrl) : null;
	const cache = useQueryClient();
	const queryKey = ["fork-attachment-retention", hostUrl];
	const retention = useQuery({
		queryKey,
		queryFn: () => {
			if (!client) throw new Error("fork_host_unavailable");
			return client.forkAttachments.retention.query();
		},
		enabled: !!client,
		retry: false,
	});
	const [draft, setDraft] = useState("");
	useEffect(() => {
		if (retention.data) setDraft(String(retention.data.days));
	}, [retention.data]);
	const save = useMutation({
		mutationFn: (days: number) => {
			if (!client) throw new Error(t({ message: "Host unavailable" }));
			return client.forkAttachments.setRetention.mutate({ days });
		},
		onSuccess: (result) => cache.setQueryData(queryKey, { days: result.days }),
	});

	const commit = () => {
		const days = Number(draft);
		if (!Number.isInteger(days) || days < 0 || days > MAX_DAYS) {
			setDraft(String(retention.data?.days ?? ""));
			return;
		}
		if (days !== retention.data?.days) save.mutate(days);
	};

	if (retention.isError || !client) return null;
	return (
		<div className="flex items-center justify-between gap-6 px-5 py-4">
			<div className="space-y-1">
				<Label htmlFor="fork-attachment-retention">
					<Trans>Delete old attachments</Trans>
				</Label>
				<p
					id="fork-attachment-retention-description"
					className="text-xs text-muted-foreground"
				>
					<Trans>
						Delete pasted images and files from workspaces after this many days.
						Set 0 to keep them.
					</Trans>
				</p>
				{save.data && save.data.deleted > 0 && (
					<p className="text-xs text-muted-foreground">
						{t({
							message: plural(save.data.deleted, {
								one: "# old attachment deleted.",
								other: "# old attachments deleted.",
							}),
						})}
					</p>
				)}
				{save.isError && (
					<p className="text-xs text-destructive">{save.error.message}</p>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Input
					id="fork-attachment-retention"
					aria-describedby="fork-attachment-retention-description"
					type="number"
					inputMode="numeric"
					min={0}
					max={MAX_DAYS}
					className="w-20"
					value={draft}
					disabled={retention.isPending || save.isPending}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") event.currentTarget.blur();
					}}
				/>
				<span className="text-xs text-muted-foreground">
					<Trans>days</Trans>
				</span>
			</div>
		</div>
	);
}
