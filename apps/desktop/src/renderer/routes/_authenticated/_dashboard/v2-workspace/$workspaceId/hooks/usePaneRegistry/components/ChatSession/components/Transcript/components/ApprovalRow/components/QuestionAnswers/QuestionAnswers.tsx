import { Trans } from "@lingui/react/macro";
import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { useState } from "react";

export function QuestionAnswers({
	item,
	onRespond,
}: {
	item: ApprovalRequest;
	onRespond: (approvalId: string, decision: Decision) => void;
}) {
	const [selected, setSelected] = useState<Record<string, string[]>>({});
	const questions = item.questions ?? [];
	return (
		<div className="space-y-3">
			{questions.map((q) => (
				<fieldset key={q.id} className="space-y-2">
					<legend className="text-sm">{q.prompt}</legend>
					{q.options.map((o) => (
						<label key={o.id} className="flex items-center gap-2 text-sm">
							<input
								type={q.allowMultiple ? "checkbox" : "radio"}
								name={`${item.id}:${q.id}`}
								checked={selected[q.id]?.includes(o.id) ?? false}
								onChange={() =>
									setSelected((current) => ({
										...current,
										[q.id]: q.allowMultiple
											? current[q.id]?.includes(o.id)
												? current[q.id].filter((id) => id !== o.id)
												: [...(current[q.id] ?? []), o.id]
											: [o.id],
									}))
								}
							/>
							{o.label}
						</label>
					))}
				</fieldset>
			))}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={questions.some((q) => !selected[q.id]?.length)}
					onClick={() =>
						onRespond(item.id, {
							type: "option",
							optionId: "cursor-answers",
							answers: questions.map((q) => ({
								questionId: q.id,
								selectedOptionIds: selected[q.id] ?? [],
							})),
						})
					}
				>
					<Trans>Submit</Trans>
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={() => onRespond(item.id, { type: "decline" })}
				>
					<Trans>Skip</Trans>
				</Button>
			</div>
		</div>
	);
}
