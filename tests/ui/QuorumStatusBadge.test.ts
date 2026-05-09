import { getQuorumStatus, QuorumState } from '../../src/ui/QuorumStatusBadge';

describe('getQuorumStatus', () => {
  it('should show quorum reached when percentage equals the threshold', () => {
    const state: QuorumState = {
      totalMembers: 5,
      votesReceived: 3,
      threshold: 60,
    };

    const result = getQuorumStatus(state);

    expect(result.reached).toBe(true);
    expect(result.label).toBe('✅ Quorum Reached');
    expect(result.percentage).toBe(60);
  });

  it('should show awaiting quorum when percentage is below the threshold', () => {
    const state: QuorumState = {
      totalMembers: 5,
      votesReceived: 2,
      threshold: 60,
    };

    const result = getQuorumStatus(state);

    expect(result.reached).toBe(false);
    expect(result.label).toBe('⏳ Awaiting Quorum');
    expect(result.percentage).toBe(40);
  });

  it('should show quorum reached when percentage is above the threshold', () => {
    const state: QuorumState = {
      totalMembers: 5,
      votesReceived: 4,
      threshold: 60,
    };

    const result = getQuorumStatus(state);

    expect(result.reached).toBe(true);
    expect(result.label).toBe('✅ Quorum Reached');
    expect(result.percentage).toBe(80);
  });
});
