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
  preset?: ConfigPreset; // Optional per-request preset override
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

  // Iterative consensus metadata (optional)
  iterativeConsensusMetadata?: {
    // Total negotiation rounds
    totalRounds: number;

    // Similarity progression
    similarityProgression: number[];

    // Consensus achieved flag
    consensusAchieved: boolean;

    // Fallback used flag
    fallbackUsed: boolean;

    // Fallback reason
    fallbackReason?: string;

    // Cost savings from early termination
    costSavings?: {
      tokensAvoided: number;
      estimatedCostSaved: number;
      costBreakdownByMember?: Record<string, number>;
    };

    // Deadlock detected flag
    deadlockDetected: boolean;

    // Human escalation triggered
    humanEscalationTriggered: boolean;

    // Quality score (0-1) derived from similarity and efficiency
    qualityScore: number;
  };
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
  error?: Error | ProviderError;
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

export interface DevilsAdvocateConfig {
  enabled: boolean;
  applyToCodeRequests: boolean;
  applyToTextRequests: boolean;
  intensityLevel: 'light' | 'moderate' | 'thorough';
  provider: string; // Which LLM provider to use for critique
  model: string; // Which model to use for critique
}

export type ConfigPreset =
  | 'fast-council'
  | 'balanced-council'
  | 'research-council'
  | 'coding-council'
  | 'cost-effective-council'
  | 'free-council';

// ============================================================================
// Synthesis Strategy Models
// ============================================================================

export type SynthesisStrategy =
  | { type: 'consensus-extraction' }
  | { type: 'weighted-fusion'; weights: Map<string, number> }
  | { type: 'meta-synthesis'; moderatorStrategy: ModeratorStrategy }
  | { type: 'iterative-consensus'; config: IterativeConsensusConfig };

export type ModeratorStrategy =
  | { type: 'permanent'; memberId: string }
  | { type: 'rotate' }
  | { type: 'strongest' };

// ============================================================================
// Cost Tracking Models
// ============================================================================

export interface RequestMetrics {
  memberCosts: Map<string, number>;
  memberLatencies: Map<string, number>;
  memberTokens: Map<string, { prompt: number; completion: number }>;
}

export interface ProcessRequestResult {
  consensusDecision: ConsensusDecision;
  metrics: RequestMetrics;
}

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

export class ProviderError extends Error {
  code: string;
  retryable: boolean;
  details?: any;

  constructor(
    code: string,
    message: string,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderError);
    }
  }
}

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
  transparency?: boolean; // Per-request transparency override
  preset?: ConfigPreset; // Per-request preset selection (e.g., 'fast-council', 'cost-effective-council')
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
  parameters: Record<string, unknown>;
  result: ToolResult;
  roundNumber: number;
}

// ============================================================================
// Budget Management Models
// ============================================================================

export interface BudgetCap {
  providerId: string;
  modelId?: string;
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  currency: string;
}

export interface BudgetStatus {
  providerId: string;
  modelId?: string;
  period: 'daily' | 'weekly' | 'monthly';
  currentSpending: number;
  budgetCap: number;
  percentUsed: number;
  disabled: boolean;
  resetAt: Date;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentSpending: number;
  budgetCap: number;
  percentUsed: number;
}

// ============================================================================
// Model Rankings Models
// ============================================================================

export interface ModelRanking {
  modelName: string;
  score: number;
  notes?: string;
}

export type ModelRankings = Record<string, number>;

// ============================================================================
// Iterative Consensus Models
// ============================================================================

/**
 * Configuration for Iterative Consensus synthesis strategy
 */
export interface IterativeConsensusConfig {
  // Maximum negotiation rounds before fallback (1-10)
  maxRounds: number;

  // Minimum similarity threshold for consensus [0.7-1.0]
  agreementThreshold: number;

  // Fallback strategy when consensus not reached
  fallbackStrategy:
    | 'meta-synthesis'
    | 'consensus-extraction'
    | 'weighted-fusion';

  // Embedding model for similarity calculation (default: 'text-embedding-3-large')
  embeddingModel: string;

  // Enable early termination at high similarity
  earlyTerminationEnabled: boolean;
  earlyTerminationThreshold: number; // default: 0.95

  // Negotiation mode
  negotiationMode: 'parallel' | 'sequential';

  // Randomization seed for sequential mode (optional, for deterministic testing)
  randomizationSeed?: number;

  // Per-round timeout in seconds
  perRoundTimeout: number;

  // Enable human escalation for deadlocks
  humanEscalationEnabled: boolean;
  escalationChannels?: string[]; // email, slack, etc.
  escalationRateLimit?: number; // max escalations per hour (default: 5)

  // Number of examples to include in prompts (default: 2)
  exampleCount: number;

  // Custom prompt templates by query type (optional)
  promptTemplates?: {
    code?: PromptTemplate;
    text?: PromptTemplate;
    custom?: Record<string, PromptTemplate>;
  };

  // Token pricing map for accurate cost projection
  tokenPriceMap?: Record<string, { input: number; output: number }>;

  // Custom alert thresholds
  customAlerts?: {
    successRateThreshold?: number; // default: 0.7
    averageRoundsThreshold?: number; // default: 5
    deadlockRateThreshold?: number; // default: 0.2
  };
}

/**
 * Prompt template for negotiation rounds
 */
export interface PromptTemplate {
  // Template name
  name: string;

  // Template content with placeholders
  template: string;

  // Placeholder descriptions
  placeholders: Record<string, string>;
}

/**
 * Response from a council member during negotiation
 */
export interface NegotiationResponse {
  // Council member identifier
  councilMemberId: string;

  // Response content
  content: string;

  // Round number
  roundNumber: number;

  // Timestamp
  timestamp: Date;

  // Agreement indicator (if endorsing another response)
  agreesWithMemberId?: string;

  // Embedding vector (cached)
  embedding?: number[];

  // Token count
  tokenCount: number;
}

/**
 * Result of similarity calculation between responses
 */
export interface SimilarityResult {
  // Pairwise similarity matrix
  // matrix[i][j] = similarity between response i and j
  matrix: number[][];

  // Average similarity across all pairs
  averageSimilarity: number;

  // Minimum similarity (lowest pair)
  minSimilarity: number;

  // Maximum similarity (highest pair)
  maxSimilarity: number;

  // Pairs below threshold
  belowThresholdPairs: Array<{
    member1: string;
    member2: string;
    similarity: number;
  }>;
}

/**
 * Analysis of convergence trend during negotiation
 */
export interface ConvergenceTrend {
  // Trend direction
  direction: 'converging' | 'diverging' | 'stagnant';

  // Convergence velocity (change per round)
  velocity: number;

  // Predicted rounds to consensus
  predictedRounds: number;

  // Deadlock risk level
  deadlockRisk: 'low' | 'medium' | 'high';

  // Recommendation
  recommendation: string;
}

/**
 * Agreement between council members
 */
export interface Agreement {
  // Members who agree
  memberIds: string[];

  // Agreed position
  position: string;

  // Similarity score among agreeing members
  cohesion: number;
}

/**
 * Example of successful negotiation for prompt guidance
 */
export interface NegotiationExample {
  // Example ID
  id: string;

  // Category
  category: 'endorsement' | 'refinement' | 'compromise';

  // Anonymized query context
  queryContext: string;

  // Example disagreement
  disagreement: string;

  // Example resolution
  resolution: string;

  // Success metrics
  roundsToConsensus: number;
  finalSimilarity: number;

  // Created timestamp
  createdAt: Date;
}

// ============================================================================
// Dynamic Model and Pricing Retrieval Models
// ============================================================================

/**
 * Provider type for model discovery
 */
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'xai';

/**
 * Model capability information
 */
export interface ModelCapability {
  type:
    | 'chat'
    | 'completion'
    | 'embedding'
    | 'vision'
    | 'function_calling'
    | 'tools';
  supported: boolean;
}

/**
 * Model discovered from provider API
 */
export interface DiscoveredModel {
  id: string;
  provider: ProviderType;
  displayName?: string;
  ownedBy?: string;
  created?: number;
  contextWindow?: number;
  capabilities?: ModelCapability[];
  deprecated: boolean;
}

/**
 * Pricing data scraped from provider website
 */
export interface PricingData {
  modelName: string; // As it appears on the pricing page
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier?: string; // e.g., 'standard', 'batch', 'cached'
  contextLimit?: number; // For tiered pricing
}

/**
 * Model classification types
 */
export type ModelClassification =
  | 'chat'
  | 'reasoning'
  | 'coding'
  | 'multimodal'
  | 'embedding'
  | 'tools'
  | 'general';

/**
 * Model usability status
 */
export type ModelUsability = 'available' | 'preview' | 'deprecated';

/**
 * Enriched model with pricing and classification
 */
export interface EnrichedModel {
  id: string;
  provider: ProviderType;
  displayName: string;
  classification: ModelClassification[];
  contextWindow: number;
  usability: ModelUsability;
  pricing: {
    inputCostPerMillion: number;
    outputCostPerMillion: number;
    tier: string;
    contextLimit?: number;
  }[];
  capabilities: ModelCapability[];
  discoveredAt: Date;
}

/**
 * Scraping configuration for a provider
 */
export interface ScrapingConfig {
  url: string;
  selectors: {
    table: string;
    modelNameColumn: number;
    inputCostColumn: number;
    outputCostColumn: number;
  };
  fallbackSelectors?: Array<{
    table: string;
    modelNameColumn: number;
    inputCostColumn: number;
    outputCostColumn: number;
  }>;
}

/**
 * Sync job result
 */
export interface SyncResult {
  success: boolean;
  timestamp: Date;
  modelsDiscovered: number;
  modelsUpdated: number;
  modelsDeprecated: number;
  pricingUpdated: number;
  errors: SyncError[];
}

/**
 * Sync error information
 */
export interface SyncError {
  provider: ProviderType;
  stage: 'discovery' | 'pricing' | 'enrichment' | 'storage';
  error: string;
}

/**
 * Sync status information
 */
export interface SyncStatus {
  lastSync: Date | null;
  nextSync: Date | null;
  status: 'idle' | 'running' | 'failed';
  lastResult: SyncResult | null;
}

/**
 * Pricing history entry
 */
export interface PricingHistoryEntry {
  modelId: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: string;
  effectiveDate: Date;
  endDate: Date | null;
}

/**
 * Model filter for querying
 */
export interface ModelFilter {
  provider?: ProviderType;
  classification?: ModelClassification;
  usability?: ModelUsability;
  minContextWindow?: number;
}
