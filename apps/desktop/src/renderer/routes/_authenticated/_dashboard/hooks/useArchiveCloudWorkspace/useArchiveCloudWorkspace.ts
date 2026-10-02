import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { createElement, useState } from "react";
import { LuArchive } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useHotkey } from "renderer/hotkeys";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { moveCloudWorkspaceRow } from "renderer/routes/_authenticated/_dashboard/utils/moveCloudWorkspaceRow";

interface ArchivedWorkspace {
	id: string;
	name: string;
	toastId: string | number;
}

export function useArchiveCloudWorkspace() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const unarchive = useUnarchiveCloudWorkspace();
	const [undoable, setUndoable] = useState<ArchivedWorkspace | null>(null);
	const { mutate } = cloudTrpc.cloudWorkspace.delete.useMutation({
		onMutate: async ({ id }) =>
			organizationId
				? {
						rollback: await moveCloudWorkspaceRow({
							utils,
							organizationId,
							id,
							to: "archived",
						}),
					}
				: undefined,
		onError: (error, _variables, context) => {
			context?.rollback();
			toast.error(errorMessage(error));
		},
		onSettled: (_data, _error, { id }) => {
			void utils.cloudWorkspace.list.invalidate();
			void utils.cloudWorkspace.get.invalidate({ id });
			void utils.cloudWorkspace.activity.invalidate({ id });
		},
	});

	const clearUndoable = (id: string) =>
		setUndoable((current) => (current?.id === id ? null : current));

	const undo = ({ id, name, toastId }: ArchivedWorkspace) => {
		clearUndoable(id);
		toast.dismiss(toastId);
		unarchive(id, {
			onSuccess: () => toast.success(t({ message: `Restored "${name}"` })),
		});
	};

	useHotkey(
		"UNDO_ARCHIVE_WORKSPACE",
		() => {
			if (undoable) undo(undoable);
		},
		{
			enabled: undoable !== null,
			enableOnFormTags: false,
			enableOnContentEditable: false,
		},
	);

	return ({ id, name }: { id: string; name: string }) => {
		navigateAwayFromWorkspace(id);
		// Unarchive only succeeds once the row is archived, so the undo waits
		// for the server.
		mutate(
			{ id },
			{
				onSuccess: ({ deleted }) => {
					if (!deleted) return;
					const toastId = toast(t({ message: `Archived "${name}"` }), {
						icon: createElement(LuArchive, { className: "size-4" }),
						classNames: {
							cancelButton:
								"bg-secondary! text-secondary-foreground! hover:bg-secondary/80!",
							actionButton: "ms-1.5!",
						},
						cancel: {
							label: t({ message: "View" }),
							onClick: () => {
								clearUndoable(id);
								void navigate({
									to: "/cloud-workspaces/$workspaceId",
									params: { workspaceId: id },
								});
							},
						},
						action: {
							label: t({ message: "Undo" }),
							onClick: () => undo({ id, name, toastId }),
						},
						onDismiss: () => clearUndoable(id),
						onAutoClose: () => clearUndoable(id),
					});
					setUndoable({ id, name, toastId });
				},
			},
		);
	};
}
