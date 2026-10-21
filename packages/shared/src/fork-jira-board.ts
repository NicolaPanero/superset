export interface ForkJiraColumn {
	id: string;
	name: string;
	statusIds: string[];
	category?: string;
}

export interface ForkJiraBoardContext {
	boards: { id: number; name: string; type: string }[];
	board: {
		id: number;
		name: string;
		filterId: string | null;
		columns: ForkJiraColumn[];
	} | null;
	sprints: { id: number; name: string; state: string }[];
}
