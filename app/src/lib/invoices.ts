/** An invoice can be edited for this many hours after it's made, and only while nothing has been paid on it. */
export const EDIT_WINDOW_HOURS = 3;

/** When this invoice stops being editable, or null if it can't be edited now. */
export function editableUntil(r: { status: string; paid_amount: string | bigint; instalments: unknown; created_at: string | Date }) {
  if (r.status !== "open" || BigInt(r.paid_amount) > 0n || r.instalments) return null;
  const until = new Date(r.created_at).getTime() + EDIT_WINDOW_HOURS * 3_600_000;
  return until > Date.now() ? new Date(until).toISOString() : null;
}
