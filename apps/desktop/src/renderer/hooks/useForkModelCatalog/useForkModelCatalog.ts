import type { SessionConfigOption } from "@superset/chat/protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type Input = {
	hostUrl: string | null;
	agent?: string;
	accountSelection?: string | null;
	workspaceId?: string;
	projectId?: string;
	model?: string | null;
	enabled?: boolean;
};
export function useForkModelCatalog(input: Input) {
	const { hostUrl, enabled = true, model, ...selection } = input;
	const active =
		enabled && !!hostUrl && !!selection.agent && selection.agent !== "none";
	const fetch = async (model?: string) => {
		if (!hostUrl || !selection.agent)
			return {
				configOptions: [] as SessionConfigOption[],
				modelConfigOptions: undefined,
			};
		return getHostServiceClientByUrl(hostUrl).agents.modelCatalog.query({
			...selection,
			agent: selection.agent,
			model,
			refresh: true,
		});
	};
	const key = [
		"fork-model-catalog",
		hostUrl,
		selection.agent,
		selection.accountSelection === undefined
			? { defaultAccount: true }
			: selection.accountSelection,
		selection.workspaceId,
		selection.projectId,
	];
	const base = useQuery({
		queryKey: [...key, null],
		enabled: active,
		queryFn: () => fetch(),
		staleTime: 60_000,
		retry: false,
	});
	const models = useMemo(
		() =>
			base.data?.configOptions.find((o) => o.category === "model")?.options ??
			[],
		[base.data],
	);
	const current = base.data?.configOptions.find(
		(o) => o.category === "model",
	)?.currentValue;
	const requested =
		model && model !== current && models.some((o) => o.id === model)
			? model
			: undefined;
	const nativeTraits = requested
		? base.data?.modelConfigOptions?.[requested]
		: undefined;
	const traits = useQuery({
		queryKey: [...key, requested ?? null],
		enabled: active && !!requested && !nativeTraits,
		queryFn: () => fetch(requested),
		staleTime: 60_000,
		retry: false,
	});
	const detail = requested && !nativeTraits ? traits : base;
	const configOptions = nativeTraits
		? [
				...(base.data?.configOptions ?? []).map((o) =>
					o.category === "model" ? { ...o, currentValue: requested } : o,
				),
				...nativeTraits,
			]
		: (detail.data?.configOptions ?? []);
	const efforts = useMemo(
		() =>
			configOptions.find((o) => o.category === "thought_level")?.options ?? [],
		[configOptions],
	);
	return {
		models,
		efforts,
		configOptions,
		isFetching:
			base.isFetching || (!!requested && !nativeTraits && traits.isFetching),
		isError: base.isError || (!!requested && !nativeTraits && traits.isError),
		refetch: () =>
			requested && !nativeTraits ? traits.refetch() : base.refetch(),
		isSuccess:
			base.isSuccess && (!requested || !!nativeTraits || traits.isSuccess),
	};
}
