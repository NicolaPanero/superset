import { reportSandboxDiffStats } from "@superset/trpc/lib/sandbox";
import { z } from "zod";

const count = z.number().int().nonnegative();
const bodySchema = z.object({
	organizationId: z.string().uuid(),
	additions: count,
	deletions: count,
	at: z.number().int().positive(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
	const { workspaceId } = await params;
	const presented = request.headers
		.get("authorization")
		?.replace(/^Bearer\s+/i, "");
	if (!presented || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	const { organizationId, ...diffStats } = parsed.data;
	const outcome = await reportSandboxDiffStats({
		workspaceId,
		organizationId,
		presentedSecret: presented,
		diffStats,
	});
	if (outcome === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	return Response.json({ ok: true });
}
