export function forkUnloggedJql(days: 7 | 30 | 90) {
	return `assignee = currentUser() AND statusCategory in ("In Progress", Done) AND (timespent is EMPTY OR timespent = 0) AND updated >= -${days}d ORDER BY updated DESC`;
}
