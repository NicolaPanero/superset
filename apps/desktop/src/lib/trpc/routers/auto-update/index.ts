import { observable } from "@trpc/server/observable";
import {
	type AutoUpdateStatusEvent,
	autoUpdateEmitter,
	checkForUpdates,
	checkForUpdatesInteractive,
	dismissUpdate,
	getUpdateStatus,
	installUpdate,
	simulateDownloading,
	simulateError,
	simulateUpdateReady,
} from "main/lib/auto-updater";
import { forkUpdateNotices } from "main/lib/fork-update-notices";
import { installAvailableForkUpdate } from "main/lib/fork-updates";
import type { ForkUpdateNotice } from "shared/fork-updates";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createAutoUpdateRouter = () => {
	return router({
		forkSubscribe: publicProcedure.subscription(() =>
			observable<ForkUpdateNotice | null>((emit) =>
				forkUpdateNotices.subscribe((notice) => emit.next(notice)),
			),
		),
		forkInstall: publicProcedure
			.input(z.object({ tag: z.string().min(1).max(200) }))
			.mutation(({ input }) => installAvailableForkUpdate(input.tag)),
		forkDismiss: publicProcedure
			.input(z.object({ tag: z.string().min(1).max(200) }))
			.mutation(({ input }) => {
				forkUpdateNotices.dismiss(input.tag);
			}),
		subscribe: publicProcedure.subscription(() => {
			return observable<AutoUpdateStatusEvent>((emit) => {
				emit.next(getUpdateStatus());

				const onStatusChanged = (event: AutoUpdateStatusEvent) => {
					emit.next(event);
				};

				autoUpdateEmitter.on("status-changed", onStatusChanged);

				return () => {
					autoUpdateEmitter.off("status-changed", onStatusChanged);
				};
			});
		}),

		getStatus: publicProcedure.query(() => {
			return getUpdateStatus();
		}),

		check: publicProcedure.mutation(() => {
			checkForUpdates();
		}),

		checkInteractive: publicProcedure.mutation(() => {
			checkForUpdatesInteractive();
		}),

		install: publicProcedure.mutation(() => {
			installUpdate();
		}),

		dismiss: publicProcedure.mutation(() => {
			dismissUpdate();
		}),

		simulateReady: publicProcedure.mutation(() => {
			simulateUpdateReady();
		}),

		simulateDownloading: publicProcedure.mutation(() => {
			simulateDownloading();
		}),

		simulateError: publicProcedure.mutation(() => {
			simulateError();
		}),
	});
};
