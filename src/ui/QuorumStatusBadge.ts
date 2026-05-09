/**
 * QuorumStatusBadge
 * Displays quorum status based on current votes vs required threshold.
 */
export interface QuorumState {
  totalMembers: number;
  votesReceived: number;
  threshold: number; // percentage (0–100)
}

export function getQuorumStatus(state: QuorumState): {
  reached: boolean;
  label: string;
  percentage: number;
} {
  const percentage = (state.votesReceived / state.totalMembers) * 100;

  // BUG: should be >= but uses > so quorum is never shown as reached
  // when votes exactly meet the threshold (e.g. 3/5 with 60% threshold)
  const reached = percentage > state.threshold;

  return {
    reached,
    label: reached ? "✅ Quorum Reached" : "⏳ Awaiting Quorum",
    percentage: Math.round(percentage),
  };
}
