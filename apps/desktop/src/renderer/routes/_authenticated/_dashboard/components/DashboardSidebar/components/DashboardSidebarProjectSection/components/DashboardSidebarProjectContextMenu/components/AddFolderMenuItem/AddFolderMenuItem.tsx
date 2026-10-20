import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { ContextMenuItem } from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LuFolderPlus } from "react-icons/lu";
import { addProjectFolders } from "renderer/lib/addProjectFolders";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";

interface AddFolderMenuItemProps {
	projectId: string;
}

export function AddFolderMenuItem({ projectId }: AddFolderMenuItemProps) {
	const { t } = useLingui();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const addFolder = async () => {
		if (!activeHostUrl) return;
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Add a folder to the project" }),
				multiple: true,
			});
			if (picked.canceled) return;
			const client = getHostServiceClientByUrl(activeHostUrl);
			await addProjectFolders(picked.paths, (path) =>
				client.projectFolders.add.mutate({ projectId, path }),
			);
			void queryClient.invalidateQueries({
				predicate: (query) =>
					JSON.stringify(query.queryKey).includes("project-folders") ||
					JSON.stringify(query.queryKey).includes("projectFolders"),
			});
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<ContextMenuItem
			disabled={!activeHostUrl}
			onSelect={() => void addFolder()}
		>
			<LuFolderPlus className="size-4 mr-2" />
			{t({ message: "Add folder…" })}
		</ContextMenuItem>
	);
}
