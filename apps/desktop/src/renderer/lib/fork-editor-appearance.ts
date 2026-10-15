import { getForkEditorDefaults } from "@superset/shared/fork-editor-appearance";

export const FORK_EDITOR_DEFAULTS = getForkEditorDefaults(
	typeof navigator === "undefined" ? "" : navigator.platform,
);
