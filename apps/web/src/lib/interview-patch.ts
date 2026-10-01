import { fromDatetimeLocal, sameUtcMinute } from "./interview-datetime";
import type { Interview, InterviewType } from "./types";

export type InterviewFormState = {
  scheduledAtLocal: string;
  type: InterviewType;
  typeLabel: string;
  interviewer: string;
  locationOrUrl: string;
  notes: string;
};

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * Build minimal PATCH body from server state + form state.
 * Terminal interviews: only interviewer, locationOrUrl, notes.
 * Never includes status.
 */
export function buildInterviewPatch(
  server: Interview,
  form: InterviewFormState,
  opts: { terminal: boolean },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (!opts.terminal) {
    const nextIso = fromDatetimeLocal(form.scheduledAtLocal);
    if (!sameUtcMinute(server.scheduledAt, nextIso)) {
      patch.scheduledAt = nextIso;
    }

    const typeChanged = form.type !== server.type;
    if (typeChanged) patch.type = form.type;

    if (form.type === "OTHER") {
      const label = emptyToNull(form.typeLabel);
      if (typeChanged || label !== server.typeLabel) {
        patch.typeLabel = label;
      }
    }
    // Non-OTHER: server coerces typeLabel to null; never send it.
  }

  const interviewer = emptyToNull(form.interviewer);
  if (interviewer !== server.interviewer) patch.interviewer = interviewer;

  const locationOrUrl = emptyToNull(form.locationOrUrl);
  if (locationOrUrl !== server.locationOrUrl) {
    patch.locationOrUrl = locationOrUrl;
  }

  const notes = emptyToNull(form.notes);
  if (notes !== server.notes) patch.notes = notes;

  return patch;
}
