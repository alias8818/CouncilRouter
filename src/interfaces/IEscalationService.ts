/**
 * Escalation Service Interface
 * Handles human escalation for deadlock situations
 */

export interface IEscalationService {
  /**
   * Queue an escalation request
   * @param requestId - Request ID that needs escalation
   * @param reason - Reason for escalation
   */
  queueEscalation(requestId: string, reason: string): Promise<void>;

  /**
   * Get pending escalations
   */
  getPendingEscalations(): Promise<Array<{
    id: string;
    requestId: string;
    reason: string;
    createdAt: Date;
  }>>;

  /**
   * Resolve an escalation
   * @param escalationId - Escalation ID to resolve
   * @param reviewedBy - Admin user who reviewed it
   * @param resolution - Resolution notes
   */
  resolveEscalation(
    escalationId: string,
    reviewedBy: string,
    resolution: string
  ): Promise<void>;

  /**
   * Check if escalation should be triggered (rate limiting)
   * @param requestId - Request ID to check
   * @returns True if escalation should be triggered
   */
  shouldEscalate(requestId: string): Promise<boolean>;
}

