type ImportWorkspace = { id: string; projectId: string | null; type: string };
export async function importWorkspace(
	client: {
		workspace: { list: { query: () => Promise<ImportWorkspace[]> } };
		workspaces: {
			createLocal: {
				mutate: (input: {
					projectId: string;
					agents: [];
					runSetup: false;
				}) => Promise<{ workspace: { id: string } }>;
			};
		};
	},
	projectId: string,
): Promise<string> {
	const existing = (await client.workspace.list.query()).find(
		(row) => row.projectId === projectId && row.type === "local",
	);
	if (existing) return existing.id;
	return (
		await client.workspaces.createLocal.mutate({
			projectId,
			agents: [],
			runSetup: false,
		})
	).workspace.id;
}
