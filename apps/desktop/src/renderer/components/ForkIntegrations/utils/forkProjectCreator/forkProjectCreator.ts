import type { HostServiceClient } from "renderer/lib/host-service-client";

type ProjectCreate = HostServiceClient["project"]["create"]["mutate"];

/** Clones with the chosen provider account; other projects use project.create. */
export function forkProjectCreator(
	client: HostServiceClient,
	connectionId: string | undefined,
): { mutate: ProjectCreate } {
	if (!connectionId) return client.project.create;
	return {
		mutate: ((input, options) => {
			if (input.mode.kind !== "clone")
				return client.project.create.mutate(input, options);
			return client.forkScm.clone.mutate(
				{
					connectionId,
					url: input.mode.url,
					parentDir: input.mode.parentDir,
					name: input.name,
				},
				options,
			);
		}) as ProjectCreate,
	};
}
