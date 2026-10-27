export function forkAcpChatChoice({
	advanced,
	chosen,
	legacy,
}: {
	advanced: boolean;
	chosen: boolean | null;
	legacy: boolean;
}): boolean {
	return !advanced || (chosen ?? legacy);
}
