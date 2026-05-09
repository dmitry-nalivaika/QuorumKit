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

  // Fixed: now uses >= to include cases where votes exactly meet the threshold
  const reached = percentage >= state.threshold;

  return {
    reached,
    label: reached ? "✅ Quorum Reached" : "⏳ Awaiting Quorum",
    percentage: Math.round(percentage),
  };
}
