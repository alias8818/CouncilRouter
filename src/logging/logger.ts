/**
 * Event Logger
 * Logs all system events to PostgreSQL database for monitoring and analytics
 */

import { randomUUID as nodeRandomUUID } from 'crypto';
import { Pool } from 'pg';
import { IEventLogger } from '../interfaces/IEventLogger';
import {
  UserRequest,
  InitialResponse,
  DeliberationRound,
  ConsensusDecision,
  CostBreakdown,
  NegotiationResponse,
  SimilarityResult
} from '../types/core';

export class EventLogger implements IEventLogger {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Log a user request
   */
  async logRequest(request: UserRequest): Promise<void> {
    try {
      const query = `
        INSERT INTO requests (
          id, user_id, session_id, query, status, 
          created_at, config_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        request.id,
        'default-user', // userId not in UserRequest, using default
        request.sessionId || null,
        request.query,
        'processing',
        request.timestamp,
        JSON.stringify({}) // config_snapshot - will be populated by orchestrator
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging request:', error);
      throw error;
    }
  }

  /**
   * Log a council member response
   */
  async logCouncilResponse(
    requestId: string,
    response: InitialResponse
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO council_responses (
          id, request_id, council_member_id, round_number,
          content, token_usage, latency_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      const values = [
        this.generateUUID(),
        requestId,
        response.councilMemberId,
        0, // Initial responses are round 0
        response.content,
        JSON.stringify(response.tokenUsage),
        response.latency,
        response.timestamp
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging council response:', error);
      throw error;
    }
  }

  /**
   * Log a deliberation round
   */
  async logDeliberationRound(
    requestId: string,
    round: DeliberationRound
  ): Promise<void> {
    try {
      // Log each exchange in the deliberation round
      for (const exchange of round.exchanges) {
        const query = `
          INSERT INTO deliberation_exchanges (
            id, request_id, round_number, council_member_id,
            content, references_to, token_usage, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        const values = [
          this.generateUUID(),
          requestId,
          round.roundNumber,
          exchange.councilMemberId,
          exchange.content,
          exchange.referencesTo,
          JSON.stringify(exchange.tokenUsage),
          new Date()
        ];

        await this.db.query(query, values);
      }
    } catch (error) {
      console.error('Error logging deliberation round:', error);
      throw error;
    }
  }

  /**
   * Log the final consensus decision
   */
  async logConsensusDecision(
    requestId: string,
    decision: ConsensusDecision
  ): Promise<void> {
    try {
      const query = `
        UPDATE requests 
        SET consensus_decision = $1,
            agreement_level = $2,
            status = $3,
            completed_at = $4
        WHERE id = $5
      `;

      const values = [
        decision.content,
        decision.agreementLevel,
        'completed',
        decision.timestamp,
        requestId
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging consensus decision:', error);
      throw error;
    }
  }

  /**
   * Log cost information with pricing version tracking
   */
  async logCost(
    requestId: string,
    cost: CostBreakdown,
    tokens?: Map<string, { prompt: number; completion: number }>
  ): Promise<void> {
    try {
      // Update total cost in requests table
      const updateQuery = `
        UPDATE requests 
        SET total_cost = $1
        WHERE id = $2
      `;
      await this.db.query(updateQuery, [cost.totalCost, requestId]);

      // Insert detailed cost records for each member
      for (const [memberId, memberCost] of cost.byMember.entries()) {
        const insertQuery = `
          INSERT INTO cost_records (
            id, request_id, provider, model,
            prompt_tokens, completion_tokens, cost,
            pricing_version, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;

        // Extract provider from memberId (format: provider-model)
        const provider = memberId.split('-')[0] || 'unknown';
        const model = memberId.split('-').slice(1).join('-') || 'unknown';

        // Get token counts if provided
        const tokenData = tokens?.get(memberId);
        const promptTokens = tokenData?.prompt || 0;
        const completionTokens = tokenData?.completion || 0;

        const values = [
          this.generateUUID(),
          requestId,
          provider,
          model,
          promptTokens,
          completionTokens,
          memberCost,
          cost.pricingVersion,
          new Date()
        ];

        await this.db.query(insertQuery, values);
      }
    } catch (error) {
      console.error('Error logging cost:', error);
      throw error;
    }
  }

  /**
   * Log a provider failure
   */
  async logProviderFailure(
    providerId: string,
    error: Error
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO provider_health (
          provider_id, status, last_failure_at,
          disabled_reason, updated_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (provider_id) 
        DO UPDATE SET
          last_failure_at = EXCLUDED.last_failure_at,
          disabled_reason = EXCLUDED.disabled_reason,
          updated_at = EXCLUDED.updated_at
      `;

      const values = [
        providerId,
        'degraded',
        new Date(),
        error.message,
        new Date()
      ];

      await this.db.query(query, values);
    } catch (dbError) {
      console.error('Error logging provider failure:', dbError);
      throw dbError;
    }
  }

  /**
   * Log Devil's Advocate activity
   */
  async logDevilsAdvocate(
    requestId: string,
    critique: {
      weaknesses: string[];
      suggestions: string[];
      severity: 'minor' | 'moderate' | 'critical';
    },
    originalLength: number,
    improvedLength: number,
    timeTakenMs: number,
    improved: boolean
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO devils_advocate_logs (
          id, request_id, critique_content, original_length, 
          improved_length, time_taken_ms, improved, created_at
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
      `;

      await this.db.query(query, [
        requestId,
        JSON.stringify(critique),
        originalLength,
        improvedLength,
        timeTakenMs,
        improved
      ]);
    } catch (error) {
      // Log error but don't fail the request
      console.error('Error logging Devil\'s Advocate activity:', error);
    }
  }

  /**
   * Generate a UUID for database records
   * CRITICAL FIX: Use crypto.randomUUID() instead of Math.random() for cryptographic security
   */
  /**
   * Log a negotiation round
   */
  async logNegotiationRound(
    requestId: string,
    roundNumber: number,
    similarityResult: SimilarityResult,
    convergenceVelocity?: number,
    deadlockRisk?: 'low' | 'medium' | 'high'
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO negotiation_rounds (
          id, request_id, round_number, average_similarity, min_similarity,
          max_similarity, below_threshold_count, convergence_velocity,
          deadlock_risk, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      const values = [
        this.generateUUID(),
        requestId,
        roundNumber,
        similarityResult.averageSimilarity,
        similarityResult.minSimilarity,
        similarityResult.maxSimilarity,
        similarityResult.belowThresholdPairs.length,
        convergenceVelocity || null,
        deadlockRisk || null,
        new Date()
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging negotiation round:', error);
      throw error;
    }
  }

  /**
   * Log a negotiation response
   */
  async logNegotiationResponse(
    requestId: string,
    response: NegotiationResponse,
    embeddingModel: string
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO negotiation_responses (
          id, request_id, round_number, council_member_id, content,
          agrees_with_member_id, token_count, embedding_model, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (request_id, round_number, council_member_id) DO UPDATE
        SET content = EXCLUDED.content,
            agrees_with_member_id = EXCLUDED.agrees_with_member_id,
            token_count = EXCLUDED.token_count,
            embedding_model = EXCLUDED.embedding_model
      `;

      const values = [
        this.generateUUID(),
        requestId,
        response.roundNumber,
        response.councilMemberId,
        response.content,
        response.agreesWithMemberId || null,
        response.tokenCount,
        embeddingModel,
        response.timestamp
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging negotiation response:', error);
      throw error;
    }
  }

  /**
   * Log consensus metadata
   */
  async logConsensusMetadata(
    requestId: string,
    metadata: {
      totalRounds: number;
      consensusAchieved: boolean;
      fallbackUsed: boolean;
      fallbackReason?: string;
      tokensAvoided?: number;
      estimatedCostSaved?: number;
      deadlockDetected: boolean;
      humanEscalationTriggered: boolean;
      finalSimilarity: number;
    }
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO consensus_metadata (
          id, request_id, total_rounds, consensus_achieved, fallback_used,
          fallback_reason, tokens_avoided, estimated_cost_saved,
          deadlock_detected, human_escalation_triggered, final_similarity, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (request_id) DO UPDATE
        SET total_rounds = EXCLUDED.total_rounds,
            consensus_achieved = EXCLUDED.consensus_achieved,
            fallback_used = EXCLUDED.fallback_used,
            fallback_reason = EXCLUDED.fallback_reason,
            tokens_avoided = EXCLUDED.tokens_avoided,
            estimated_cost_saved = EXCLUDED.estimated_cost_saved,
            deadlock_detected = EXCLUDED.deadlock_detected,
            human_escalation_triggered = EXCLUDED.human_escalation_triggered,
            final_similarity = EXCLUDED.final_similarity
      `;

      const values = [
        this.generateUUID(),
        requestId,
        metadata.totalRounds,
        metadata.consensusAchieved,
        metadata.fallbackUsed,
        metadata.fallbackReason || null,
        metadata.tokensAvoided || null,
        metadata.estimatedCostSaved || null,
        metadata.deadlockDetected,
        metadata.humanEscalationTriggered,
        metadata.finalSimilarity,
        new Date()
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging consensus metadata:', error);
      throw error;
    }
  }

  private generateUUID(): string {
    // Use Node.js built-in crypto.randomUUID() for proper UUID v4 generation
    // Falls back to custom implementation for older Node.js versions
    try {
      return nodeRandomUUID();
    } catch {
      // Fall through to manual implementation
    }

    // Fallback for older environments (though this should not be needed in modern Node.js)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
