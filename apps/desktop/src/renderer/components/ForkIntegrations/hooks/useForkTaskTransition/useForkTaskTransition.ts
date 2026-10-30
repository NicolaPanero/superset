import type { ForkTask } from "@superset/shared/fork-integrations";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { required } from "../../utils/required";
import { useForkConnections } from "../useForkConnections";

export function useForkTaskTransition(
	task: ForkTask | null,
	enabled: boolean,
	onSuccess: () => void,
) {
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const [requiredTransition, setRequiredTransition] =
		useState<ForkTaskTransition | null>(null);
	const supported = (data?.version ?? 0) >= 4;
	const transitions = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"task-transitions",
			task?.connectionId,
			task?.key,
			task?.status.id,
		],
		queryFn: () =>
			required(client).forkTasks.transitions.query({
				connectionId: required(task).connectionId,
				key: required(task).key,
			}),
		enabled: !!task && !!client && supported && enabled,
		staleTime: 0,
		retry: false,
		networkMode: "always",
	});
	const mutation = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: ({
			transition,
			fields,
		}: {
			transition: ForkTaskTransition;
			fields: Record<string, unknown>;
		}) =>
			required(client).forkTasks.transition.mutate({
				connectionId: required(task).connectionId,
				key: required(task).key,
				transitionId: transition.id,
				fields,
			}),
		onSuccess: () => {
			setRequiredTransition(null);
			onSuccess();
		},
		onSettled: () => {
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "tasks"],
			});
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "task"],
			});
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "task-transitions"],
			});
		},
	});
	return {
		task,
		transitions,
		mutation,
		supported,
		requiredTransition,
		setRequiredTransition,
		choose: (transition: ForkTaskTransition) => {
			if (mutation.isPending) return;
			mutation.reset();
			if (transition.fields.length > 0) setRequiredTransition(transition);
			else mutation.mutate({ transition, fields: {} });
		},
	};
}

export type ForkTaskTransition = Awaited<
	ReturnType<
		NonNullable<
			ReturnType<typeof useForkConnections>["client"]
		>["forkTasks"]["transitions"]["query"]
	>
>[number];
