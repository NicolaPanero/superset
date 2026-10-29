import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export function ForkAutomationLimits() {
	const { client, hostUrl } = useForkConnections();
	const settings = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-limits"],
		queryFn: () => required(client).forkTasks.automationSettings.query(),
		enabled: !!client,
		retry: false,
	});
	const [maxRunning, setMaxRunning] = useState(2);
	const [maxPerProject, setMaxPerProject] = useState(1);
	useEffect(() => {
		if (!settings.data) return;
		setMaxRunning(settings.data.maxRunning);
		setMaxPerProject(settings.data.maxPerProject);
	}, [settings.data]);
	const save = useMutation({
		mutationFn: () =>
			required(client).forkTasks.automationSaveSettings.mutate({
				maxRunning,
				maxPerProject,
			}),
		onSuccess: () => void settings.refetch(),
	});
	const changed =
		settings.data &&
		(settings.data.maxRunning !== maxRunning ||
			settings.data.maxPerProject !== maxPerProject);
	return (
		<div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
			<div className="space-y-1">
				<Label htmlFor="fork-automation-max">
					<Trans>Agents at the same time</Trans>
				</Label>
				<Input
					id="fork-automation-max"
					type="number"
					min={1}
					max={10}
					className="w-24"
					value={maxRunning}
					onChange={(e) => setMaxRunning(Number(e.target.value) || 1)}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor="fork-automation-max-project">
					<Trans>Per project</Trans>
				</Label>
				<Input
					id="fork-automation-max-project"
					type="number"
					min={1}
					max={10}
					className="w-24"
					value={maxPerProject}
					onChange={(e) => setMaxPerProject(Number(e.target.value) || 1)}
				/>
			</div>
			<Button
				size="sm"
				variant="outline"
				disabled={!changed || save.isPending}
				onClick={() => save.mutate()}
			>
				<Trans>Save limits</Trans>
			</Button>
			<p className="w-full text-xs text-muted-foreground">
				<Trans>
					Runs beyond these limits wait in the queue and start when an agent
					finishes.
				</Trans>
			</p>
		</div>
	);
}
