import { create } from "zustand";

interface SelectedRepoStore {
	/** Chosen extra project folder by workspace id; absent means the main repo. */
	keys: Record<string, string>;
	select: (workspaceId: string, repoKey: string | null) => void;
}

export const useSelectedRepoStore = create<SelectedRepoStore>((set) => ({
	keys: {},
	select: (workspaceId, repoKey) =>
		set((state) => {
			if (repoKey === null) {
				if (!(workspaceId in state.keys)) return state;
				const { [workspaceId]: _removed, ...keys } = state.keys;
				return { keys };
			}
			if (state.keys[workspaceId] === repoKey) return state;
			return { keys: { ...state.keys, [workspaceId]: repoKey } };
		}),
}));
