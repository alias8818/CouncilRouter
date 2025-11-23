/**
 * Core data models for the AI Council Proxy system
 */

// ============================================================================
// Request and Response Models
// ============================================================================

export interface UserRequest {
  id: string;
  query: string;
  sessionId?: string;
  context?: ConversationContext;
  timestamp: Date;
}

export interface InitialResponse {
  councilMemberId: string;
  content: string;
  tokenUsage: TokenUsage;
  latency: number;
  timestamp: Date;
}

export interface ConsensusDecision {
  content: string;
  confidence: 'high' | 'medium' | 'low';
  agreementLevel: number; // 0-1
  synthesisStrategy: SynthesisStrategy;
  contributingMembers: string[];
  timestamp: Date;
}

// ============================================================================
// Council Member Models
// ============================================================================

export interface CouncilMember {
  id: string;
  provider: string;
  model: string;
  version?: string;
  weight?: number;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[]; // error codes that should trigger retry
}

// ============================================================================
// Deliberation Models
// ============================================================================

export interface DeliberationThread {
  rounds: DeliberationRound[];
  totalDuration: number;
}

export interface DeliberationRound {
  roundNumber: number;
  exchanges: Exchange[];
}

export interface Exchange {
  councilMemberId: string;
  content: string;
  referencesTo: string[]; // IDs of responses being critiqued
  tokenUsage: TokenUsage;
}

// ============================================================================
// Provider Models
// ============================================================================

export interface ProviderResponse {
  content: string;
  tokenUsage: TokenUsage;
  latency: number;
  success: boolean;
  error?: Error;
}

export interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'disabled';
  successRate: number;
  avgLatency: number;
  lastFailure?: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================================================
// Session Models
// ============================================================================

export interface Session {
  id: string;
  userId: string;
  history: HistoryEntry[];
  createdAt: Date;
  lastActivityAt: Date;
  contextWindowUsed: number;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  requestId?: string;
}

export interface ConversationContext {
  messages: HistoryEntry[];
  totalTokens: number;
  summarized: boolean;
}

// ============================================================================
// Configuration Models
// ============================================================================

export interface CouncilConfig {
  members: CouncilMember[];
  minimumSize: number;
  requireMinimumForConsensus: boolean;
}

export interface DeliberationConfig {
  rounds: number; // 0-5
  preset: 'fast' | 'balanced' | 'thorough' | 'research-grade';
}

export interface SynthesisConfig {
  strategy: SynthesisStrategy;
  moderatorStrategy?: ModeratorStrategy;
  weights?: Map<string, number>;
}

export interface PerformanceConfig {
  globalTimeout: number; // seconds
  enableFastFallback: boolean;
  streamingEnabled: boolean;
}

export interface TransparencyConfig {
  enabled: boolean; // Whether transparency mode is available
  forcedTransparency: boolean; // Always show deliberation regardless of user preference
}

export type ConfigPreset = 
  | 'fast-council'
  | 'balanced-council'
  | 'research-council';

// ============================================================================
// Synthesis Strategy Models
// ============================================================================

export type SynthesisStrategy = 
  | { type: 'consensus-extraction' }
  | { type: 'weighted-fusion'; weights: Map<string, number> }
  | { type: 'meta-synthesis'; moderatorStrategy: ModeratorStrategy };

export type ModeratorStrategy =
  | { type: 'permanent'; memberId: string }
  | { type: 'rotate' }
  | { type: 'strongest' };

// ============================================================================
// Cost Tracking Models
// ============================================================================

export interface CostBreakdown {
  totalCost: number;
  currency: string;
  byProvider: Map<string, number>;
  byMember: Map<string, number>;
  pricingVersion: string;
}

// ============================================================================
// Analytics Models
// ============================================================================

export interface RequestSummary {
  requestId: string;
  query: string;
  status: string;
  consensusDecision: string;
  cost: number;
  latency: number;
  agreementLevel: number;
  timestamp: Date;
}

export interface PerformanceMetrics {
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  byCouncilSize: Map<number, LatencyStats>;
  byDeliberationRounds: Map<number, LatencyStats>;
  timeoutRate: number;
}

export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface CostAnalytics {
  totalCost: number;
  byProvider: Map<string, number>;
  byMember: Map<string, number>;
  costPerRequest: number;
  projectedMonthlyCost: number;
}

export interface AgreementMatrix {
  members: string[];
  disagreementRates: number[][]; // matrix of disagreement rates
}

export interface InfluenceScores {
  scores: Map<string, number>; // member ID -> influence score (0-1)
}

// ============================================================================
// Error Models
// ============================================================================

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    retryable: boolean;
  };
  requestId?: string;
  timestamp: Date;
}

// ============================================================================
// API Models
// ============================================================================

export interface APIRequestBody {
  query: string;
  sessionId?: string;
  streaming?: boolean;
}

export interface APIResponse {
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  consensusDecision?: string;
  createdAt: Date;
  completedAt?: Date;
  fromCache?: boolean; // Indicates if response was served from idempotency cache
}

// ============================================================================
// Filter Models
// ============================================================================

export interface RequestFilters {
  status?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  minCost?: number;
  maxCost?: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// ============================================================================
// Duration Type
// ============================================================================

export type Duration = number; // milliseconds

// ============================================================================
// Red Team Testing Models
// ============================================================================

export interface RedTeamPrompt {
  id: string;
  testName: string;
  prompt: string;
  attackCategory: string;
  createdAt: Date;
}

export interface RedTeamTestResult {
  id: string;
  testName: string;
  prompt: string;
  attackCategory: string;
  councilMemberId: string;
  response: string;
  compromised: boolean;
  createdAt: Date;
}

export interface RedTeamAnalytics {
  resistanceRatesByMember: Map<string, number>; // member ID -> resistance rate (0-1)
  resistanceRatesByCategory: Map<string, number>; // category -> resistance rate (0-1)
  resistanceRatesByMemberAndCategory: Map<string, Map<string, number>>; // member ID -> category -> rate
}

// ============================================================================
// Tool Execution Models
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  adapter: string; // which adapter to use
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  councilMemberId: string;
  requestId: string;
}

export interface ToolResult {
  toolName: string;
  councilMemberId: string;
  success: boolean;
  result?: any;
  error?: string;
  latency: number;
  timestamp: Date;
}

export interface ToolUsage {
  councilMemberId: string;
  toolName: string;
  parameters: Record<string, any>;
  result: ToolResult;
  roundNumber: number;
}
