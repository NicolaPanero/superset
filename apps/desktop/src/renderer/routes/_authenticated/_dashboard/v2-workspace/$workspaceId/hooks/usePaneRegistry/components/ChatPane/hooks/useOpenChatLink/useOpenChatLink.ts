import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import {
	tierFor,
	useInlineFilePolicy,
	useTerminalFolderPolicy,
	useUrlLinkAction,
} from "renderer/lib/clickPolicy";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useRecentlyViewedFiles } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";
import { useRevealInFinder } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRevealInFinder";
import { useRightPaneLinkTarget } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/RightPaneLinkTargetProvider";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	runFileLinkAction,
	runFolderLinkAction,
	runUrlLinkAction,
	type TerminalLinkActionDeps,
} from "../../../../utils/runTerminalLinkAction";
import type { OpenLink } from "../../../ChatSession/providers/ChatPaneActionsProvider";
import { type LocatedPath, locatePath } from "./utils/locatePath";
import { parseFileHref } from "./utils/parseFileHref";
import {
	parseTicketedMediaLink,
	rewriteTicketedMediaUrl,
} from "./utils/parseTicketedMediaLink";

const WEB_URL = /^https?:\/\//i;

function mediaBaseUrl(): string {
	const fromEnv = process.env.MEDIA_URL;
	if (fromEnv) return fromEnv;
	try {
		const web = new URL(env.NEXT_PUBLIC_WEB_URL);
		if (web.hostname === "localhost" || web.hostname === "127.0.0.1") {
			return `http://media.usercontent.localhost:${web.port || "8787"}`;
		}
	} catch {}
	return "http://media.usercontent.localhost:8787";
}

export function useOpenChatLink({
	store,
	workspaceId,
	onOpenFile,
	onRevealPath,
	showHint,
}: {
	store: RendererContext<PaneViewerData>["store"];
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
	showHint: (clientX: number, clientY: number) => void;
}): OpenLink {
	const { t } = useLingui();
	const filePolicy = useInlineFilePolicy();
	const folderPolicy = useTerminalFolderPolicy();
	const getUrlAction = useUrlLinkAction("2-tier");
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const revealInFinder = useRevealInFinder(workspaceId);
	const rightPane = useRightPaneLinkTarget();
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const statPath = workspaceTrpc.filesystem.statPath.useMutation();
	const hostClient = workspaceTrpc.useUtils().client;
	const { recentFiles } = useRecentlyViewedFiles(workspaceId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const saveToDownloads = electronTrpc.external.saveToDownloads.useMutation();
	const openSavedPath = electronTrpc.external.openFolderInFinder.useMutation();
	const locateRef = useRef<(path: string) => Promise<LocatedPath | null>>(
		async () => null,
	);
	locateRef.current = (path) =>
		locatePath(path, {
			stat: (target) => statPath.mutateAsync({ workspaceId, path: target }),
			resolveFile: (reference) =>
				hostClient.filesystem.resolveFileReference.query({
					workspaceId,
					reference,
					preferredRelativePaths: recentFiles.map((file) => file.relativePath),
				}),
		});

	const depsRef = useRef<TerminalLinkActionDeps>({
		store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath: undefined,
		rightPane,
	});
	depsRef.current = {
		store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath: workspace?.worktreePath ?? undefined,
		rightPane,
	};

	const openHostAttachment = useCallback(
		async (attachmentId: string) => {
			if (!hostUrl) {
				toast.error(t({ message: "Could not reach the workspace host" }));
				return;
			}
			try {
				const file = await getHostServiceClientByUrl(
					hostUrl,
				).attachments.read.query({ attachmentId });
				const ext = file.mediaType.split("/")[1] ?? "bin";
				const { path } = await saveToDownloads.mutateAsync({
					filename: `attachment-${attachmentId.slice(0, 8)}.${ext}`,
					dataBase64: file.data,
				});
				await openSavedPath.mutateAsync(path);
			} catch (error) {
				console.error("Failed to open chat attachment:", attachmentId, error);
				toast.error(t({ message: "Could not open file" }));
			}
		},
		[hostUrl, openSavedPath, saveToDownloads, t],
	);

	return useCallback(
		(href, event) => {
			const isPlain = tierFor(event, "2-tier") === "plain";
			if (WEB_URL.test(href)) {
				const parsedMedia = parseTicketedMediaLink(href);
				if (parsedMedia?.kind === "host-attachment") {
					void openHostAttachment(parsedMedia.attachmentId);
					return true;
				}
				const remapped = rewriteTicketedMediaUrl(href, mediaBaseUrl()) ?? href;
				const action =
					getUrlAction(event, remapped) ?? (isPlain ? "pane" : null);
				if (action === null) showHint(event.clientX, event.clientY);
				else runUrlLinkAction(depsRef.current, remapped, action);
				return true;
			}

			const file = parseFileHref(href);
			if (!file) return false;
			void locateRef.current(file.path).then(
				(stat) => {
					if (!stat) {
						const { path } = file;
						toast.error(t({ message: `Path not found: ${path}` }));
						return;
					}
					if (stat.isDirectory) {
						const intent =
							folderPolicy.map[tierFor(event, "2-tier")] ??
							(isPlain ? "reveal" : null);
						if (intent === null) showHint(event.clientX, event.clientY);
						else
							runFolderLinkAction(depsRef.current, stat.resolvedPath, intent);
						return;
					}
					const action =
						filePolicy.getAction(event) ?? (isPlain ? "pane" : null);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					runFileLinkAction(
						depsRef.current,
						{ path: stat.resolvedPath, row: file.row, col: file.col },
						action,
					);
				},
				(error) => {
					console.error("Failed to stat chat link path:", file.path, error);
					toast.error(t({ message: "Could not reach the workspace host" }));
				},
			);
			return true;
		},
		[getUrlAction, filePolicy, folderPolicy, showHint, t, openHostAttachment],
	);
}
