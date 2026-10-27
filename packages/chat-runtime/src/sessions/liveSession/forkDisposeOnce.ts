const disposals = new WeakMap<object, Promise<void>>();

export function forkDisposeOnce(
	owner: object,
	dispose: () => Promise<void>,
): Promise<void> {
	const previous = disposals.get(owner);
	if (previous) return previous;
	let resolve!: () => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<void>((done, failed) => {
		resolve = done;
		reject = failed;
	});
	disposals.set(owner, promise);
	try {
		void dispose().then(resolve, reject);
	} catch (error) {
		reject(error);
	}
	return promise;
}
