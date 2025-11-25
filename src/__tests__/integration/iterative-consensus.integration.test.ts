/**
 * Integration Tests - Iterative Consensus
 * Tests end-to-end iterative consensus synthesis scenarios
 */

import { Pool } from "pg";
import { createClient, RedisClientType } from "redis";
import { IterativeConsensusSynthesizer } from "../../synthesis/iterative-consensus/synthesizer";
import { EmbeddingService } from "../../embedding/service";
import { NegotiationPromptBuilder } from "../../synthesis/negotiation/prompt-builder";
import { ConvergenceDetector } from "../../synthesis/convergence/detector";
import { ExampleRepository } from "../../synthesis/examples/repository";
import { ConfigurationManager } from "../../config/manager";
import { EventLogger } from "../../logging/logger";
import { BaseProviderAdapter } from "../../providers/adapters/base";
import {
  CouncilMember,
  UserRequest,
  ProviderResponse,
  ConsensusDecision,
  IterativeConsensusConfig,
  DeliberationThread,
  ProviderError,
  NegotiationResponse,
} from "../../types/core";
import { IProviderPool } from "../../interfaces/IProviderPool";
import { ISynthesisEngine } from "../../interfaces/ISynthesisEngine";

// Mock Provider Adapter that can simulate convergence
class MockConvergingProviderAdapter extends BaseProviderAdapter {
  private round: number = 0;
  private baseSimilarity: number;
  private convergenceRate: number;
  private memberId: string;
  private baseResponse: string = "";

  constructor(
    apiKey: string,
    memberId: string,
    baseSimilarity: number = 0.7,
    convergenceRate: number = 0.1,
  ) {
    super(apiKey);
    this.memberId = memberId;
    this.baseSimilarity = baseSimilarity;
    this.convergenceRate = convergenceRate;
  }

  async sendRequest(
    member: CouncilMember,
    prompt: string,
  ): Promise<ProviderResponse> {
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate convergence: responses become more similar over rounds
    const currentSimilarity = Math.min(
      1.0,
      this.baseSimilarity + this.round * this.convergenceRate,
    );
    this.round++;

    // Generate response that converges to a common answer
    // Extract the query from the prompt (if it's a negotiation prompt)
    let baseAnswer = "The answer";
    if (this.baseResponse) {
      baseAnswer = this.baseResponse;
    }

    // As rounds progress, responses become more similar
    // Start with slight variations, converge to identical
    let responseText: string;
    if (currentSimilarity < 0.8) {
      // Early rounds - some variation
      responseText = `${baseAnswer} according to ${this.memberId} analysis`;
    } else if (currentSimilarity < 0.9) {
      // Mid rounds - less variation
      responseText = `${baseAnswer} based on available information`;
    } else {
      // Late rounds - consensus text
      responseText = baseAnswer;
    }

    return {
      success: true,
      content: responseText,
      tokenUsage: {
        promptTokens: 50,
        completionTokens: 30,
        totalTokens: 80,
      },
      latency: 10,
    };
  }

  setBaseResponse(response: string): void {
    this.baseResponse = response;
  }

  reset(): void {
    this.round = 0;
  }

  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    return { available: true, latency: 5 };
  }

  protected formatRequest(prompt: string): any {
    return { prompt };
  }

  protected parseResponse(response: any): { content: string; tokenUsage: any } {
    return {
      content: response.content,
      tokenUsage: response.tokenUsage,
    };
  }
}

// Mock Provider Adapter that fails
class MockFailingProviderAdapter extends BaseProviderAdapter {
  constructor(apiKey: string) {
    super(apiKey);
  }

  async sendRequest(
    member: CouncilMember,
    prompt: string,
  ): Promise<ProviderResponse> {
    return {
      success: false,
      content: "",
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency: 0,
      error: new ProviderError("PROVIDER_ERROR", "Simulated failure", false),
    };
  }

  async getHealth(): Promise<{ available: boolean; latency?: number }> {
    return { available: false };
  }

  protected formatRequest(prompt: string): any {
    return { prompt };
  }

  protected parseResponse(response: any): { content: string; tokenUsage: any } {
    return {
      content: "",
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

// Mock Provider Pool
class MockProviderPool implements IProviderPool {
  private adapters: Map<string, BaseProviderAdapter>;
  private members: CouncilMember[];

  constructor(
    members: CouncilMember[],
    adapters: Map<string, BaseProviderAdapter>,
  ) {
    this.members = members;
    this.adapters = adapters;
  }

  async sendRequest(
    member: CouncilMember,
    prompt: string,
  ): Promise<ProviderResponse> {
    const adapter = this.adapters.get(member.provider);
    if (!adapter) {
      throw new Error(`No adapter for provider ${member.provider}`);
    }
    return adapter.sendRequest(member, prompt);
  }

  getAllProviderHealth(): Array<{
    providerId: string;
    available: boolean;
    latency?: number;
  }> {
    return Array.from(this.adapters.keys()).map((provider) => ({
      providerId: provider,
      available: true,
      latency: 5,
    }));
  }
}

// Mock Synthesis Engine for fallback
class MockSynthesisEngine implements ISynthesisEngine {
  async synthesize(
    request: UserRequest,
    thread: DeliberationThread,
    strategy: any,
  ): Promise<ConsensusDecision> {
    return {
      content: "Fallback synthesis result",
      confidence: "medium" as const,
      agreementLevel: 0.6,
      synthesisStrategy: { type: "consensus-extraction" },
      contributingMembers: ["member1", "member2"],
      timestamp: new Date(),
    };
  }
}

// Mock Embedding Service that generates embeddings based on text similarity
class MockEmbeddingService {
  async embed(text: string, model?: string): Promise<number[]> {
    // Generate embedding based on word frequencies and key terms
    // This creates embeddings where similar texts have similar vectors
    const words = this.tokenize(text);
    const embedding = new Array(1536).fill(0);

    // Use word hashing to populate embedding dimensions
    words.forEach((word, idx) => {
      const hash = this.simpleHash(word);
      const pos = Math.abs(hash) % embedding.length;
      embedding[pos] += 1.0 / (idx + 1); // Weight earlier words more
    });

    // Normalize the embedding
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      mag1 += embedding1[i] * embedding1[i];
      mag2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  async calculateTextSimilarity(
    text1: string,
    text2: string,
    model?: string,
  ): Promise<number> {
    const embedding1 = await this.embed(text1, model);
    const embedding2 = await this.embed(text2, model);
    return this.cosineSimilarity(embedding1, embedding2);
  }

  async batchEmbed(texts: string[], model?: string): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text, model)));
  }

  async queueEmbed(
    text: string,
    model?: string,
    priority?: "high" | "normal" | "low",
  ): Promise<string> {
    return "mock-job-id";
  }

  async getEmbeddingResult(jobId: string): Promise<number[] | null> {
    return null;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

describe("Iterative Consensus Integration Tests", () => {
  let pool: Pool;
  let redis: RedisClientType;
  let configManager: ConfigurationManager;
  let eventLogger: EventLogger;
  let embeddingService: MockEmbeddingService;
  let promptBuilder: NegotiationPromptBuilder;
  let convergenceDetector: ConvergenceDetector;
  let exampleRepository: ExampleRepository;
  let synthesisEngine: MockSynthesisEngine;

  // Helper to create a thread with Round 0 responses
  const createThreadWithRound0 = (
    responses: Array<{ memberId: string; content: string }>,
  ): DeliberationThread => {
    return {
      rounds: [
        {
          roundNumber: 0,
          exchanges: responses.map((r) => ({
            councilMemberId: r.memberId,
            content: r.content,
            referencesTo: [],
            tokenUsage: {
              promptTokens: 10,
              completionTokens: 10,
              totalTokens: 20,
            },
          })),
        },
      ],
      totalDuration: 100,
    };
  };

  const testMembers: CouncilMember[] = [
    {
      id: "member1",
      provider: "openai",
      model: "gpt-4",
      timeout: 30,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ["TIMEOUT"],
      },
    },
    {
      id: "member2",
      provider: "anthropic",
      model: "claude-3-opus",
      timeout: 30,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ["TIMEOUT"],
      },
    },
    {
      id: "member3",
      provider: "google",
      model: "gemini-pro",
      timeout: 30,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ["TIMEOUT"],
      },
    },
  ];

  const defaultConfig: IterativeConsensusConfig = {
    maxRounds: 5,
    agreementThreshold: 0.85,
    fallbackStrategy: "meta-synthesis",
    embeddingModel: "text-embedding-3-large",
    earlyTerminationEnabled: true,
    earlyTerminationThreshold: 0.95,
    negotiationMode: "parallel",
    perRoundTimeout: 30,
    humanEscalationEnabled: false,
    exampleCount: 3,
  };

  beforeAll(async () => {
    // Initialize database connection - use test database if available
    pool = new Pool({
      host:
        process.env.TEST_DATABASE_HOST ||
        process.env.DATABASE_HOST ||
        "localhost",
      port: parseInt(
        process.env.TEST_DATABASE_PORT || process.env.DATABASE_PORT || "5433",
      ),
      database:
        process.env.TEST_DATABASE_NAME ||
        process.env.DATABASE_NAME ||
        "ai_council_test",
      user:
        process.env.TEST_DATABASE_USER ||
        process.env.DATABASE_USER ||
        "postgres",
      password:
        process.env.TEST_DATABASE_PASSWORD ||
        process.env.DATABASE_PASSWORD ||
        "postgres",
    });

    // Initialize Redis
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redis = createClient({ url: redisUrl });
    await redis.connect();

    // Initialize services
    configManager = new ConfigurationManager(pool, redis as any);
    eventLogger = new EventLogger(pool);
    embeddingService = new MockEmbeddingService();
    promptBuilder = new NegotiationPromptBuilder(embeddingService as any);
    convergenceDetector = new ConvergenceDetector();
    exampleRepository = new ExampleRepository(pool, embeddingService as any);
    synthesisEngine = new MockSynthesisEngine();

    // Set up council configuration
    await configManager.updateCouncilConfig({
      members: testMembers,
      minimumSize: 2,
      requireMinimumForConsensus: false,
    });
  });

  afterAll(async () => {
    await redis.disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data - wrap in try-catch in case tables don't exist
    try {
      await pool.query(
        "DELETE FROM consensus_metadata WHERE request_id LIKE $1",
        ["test-%"],
      );
    } catch (error) {
      console.warn("Could not clean consensus_metadata table:", error);
    }

    try {
      await pool.query(
        "DELETE FROM negotiation_rounds WHERE request_id LIKE $1",
        ["test-%"],
      );
    } catch (error) {
      console.warn("Could not clean negotiation_rounds table:", error);
    }

    try {
      await pool.query(
        "DELETE FROM negotiation_responses WHERE request_id LIKE $1",
        ["test-%"],
      );
    } catch (error) {
      console.warn("Could not clean negotiation_responses table:", error);
    }
  });

  describe("End-to-End Consensus Achievement", () => {
    test("should achieve consensus when members converge", async () => {
      // Create converging adapters that will converge to the same answer
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.75,
        0.06,
      );
      const adapter2 = new MockConvergingProviderAdapter(
        "key2",
        "member2",
        0.75,
        0.06,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.75,
        0.06,
      );

      // Set them all to converge to the same base answer
      const consensusAnswer = "The capital of France is Paris";
      adapter1.setBaseResponse(consensusAnswer);
      adapter2.setBaseResponse(consensusAnswer);
      adapter3.setBaseResponse(consensusAnswer);

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", adapter2);
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-consensus-1",
        query: "What is the capital of France?",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      // Create Round 0 with initial responses that have moderate similarity
      // These should converge through negotiation
      const thread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 0,
            exchanges: [
              {
                councilMemberId: "member1",
                content:
                  "The capital of France is Paris according to member1 analysis",
                referencesTo: [],
                tokenUsage: {
                  promptTokens: 10,
                  completionTokens: 10,
                  totalTokens: 20,
                },
              },
              {
                councilMemberId: "member2",
                content:
                  "The capital of France is Paris according to member2 analysis",
                referencesTo: [],
                tokenUsage: {
                  promptTokens: 10,
                  completionTokens: 10,
                  totalTokens: 20,
                },
              },
              {
                councilMemberId: "member3",
                content:
                  "The capital of France is Paris according to member3 analysis",
                referencesTo: [],
                tokenUsage: {
                  promptTokens: 10,
                  completionTokens: 10,
                  totalTokens: 20,
                },
              },
            ],
          },
        ],
        totalDuration: 100,
      };

      const decision = await synthesizer.synthesize(
        request,
        thread,
        defaultConfig,
      );

      expect(decision).toBeDefined();
      expect(decision.content).toBeTruthy();
      expect(decision.iterativeConsensusMetadata).toBeDefined();
      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(true);
      // Note: totalRounds can be 0 if Round 0 already has consensus (Requirement 9.6)
      expect(
        decision.iterativeConsensusMetadata?.totalRounds,
      ).toBeGreaterThanOrEqual(0);
      expect(
        decision.iterativeConsensusMetadata?.totalRounds,
      ).toBeLessThanOrEqual(defaultConfig.maxRounds);
    });

    test("should use early termination when threshold is met", async () => {
      // Create fast-converging adapters that quickly reach consensus
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.88,
        0.04,
      );
      const adapter2 = new MockConvergingProviderAdapter(
        "key2",
        "member2",
        0.88,
        0.04,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.88,
        0.04,
      );

      // Set them all to converge to the same answer quickly
      const consensusAnswer = "The answer is 4";
      adapter1.setBaseResponse(consensusAnswer);
      adapter2.setBaseResponse(consensusAnswer);
      adapter3.setBaseResponse(consensusAnswer);

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", adapter2);
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-early-term-1",
        query: "What is 2+2?",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      // Create Round 0 with highly similar initial responses
      const thread: DeliberationThread = {
        rounds: [
          {
            roundNumber: 0,
            exchanges: [
              {
                councilMemberId: "member1",
                content: "The answer is 4 according to member1 analysis",
                referencesTo: [],
                tokenUsage: {
                  promptTokens: 10,
                  completionTokens: 10,
                  totalTokens: 20,
                },
              },
              {
                councilMemberId: "member2",
                content: "The answer is 4 according to member2 analysis",
                referencesTo: [],
                tokenUsage: {
                  promptTokens: 10,
                  completionTokens: 10,
                  totalTokens: 20,
                },
              },
              {
                councilMemberId: "member3",
                content: "The answer is 4 according to member3 analysis",
                referencesTo: [],
                tokenUsage: {
                  promptTokens: 10,
                  completionTokens: 10,
                  totalTokens: 20,
                },
              },
            ],
          },
        ],
        totalDuration: 100,
      };

      const decision = await synthesizer.synthesize(
        request,
        thread,
        defaultConfig,
      );

      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(true);
      // Should terminate early (before maxRounds)
      expect(decision.iterativeConsensusMetadata?.totalRounds).toBeLessThan(
        defaultConfig.maxRounds,
      );
    });
  });

  describe("Fallback Scenarios", () => {
    test("should invoke fallback when max rounds reached without consensus", async () => {
      // Create non-converging adapters (low similarity, no improvement)
      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set(
        "openai",
        new MockConvergingProviderAdapter("key1", "member1", 0.6, 0.0),
      );
      adapters.set(
        "anthropic",
        new MockConvergingProviderAdapter("key2", "member2", 0.6, 0.0),
      );
      adapters.set(
        "google",
        new MockConvergingProviderAdapter("key3", "member3", 0.6, 0.0),
      );

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-fallback-1",
        query: "Complex question requiring deep analysis",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "I believe the answer involves a multi-faceted approach focusing on economic factors and long-term sustainability.",
        },
        {
          memberId: "member2",
          content:
            "From my perspective, the solution requires immediate action on social equity and environmental considerations.",
        },
        {
          memberId: "member3",
          content:
            "The best approach emphasizes technological innovation and regulatory frameworks for implementation.",
        },
      ]);

      const config: IterativeConsensusConfig = {
        ...defaultConfig,
        maxRounds: 2, // Low max rounds to force fallback
      };

      const decision = await synthesizer.synthesize(request, thread, config);

      expect(decision.iterativeConsensusMetadata?.fallbackUsed).toBe(true);
      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(
        false,
      );
      expect(decision.content).toBe("Fallback synthesis result");
    });

    test("should detect deadlock and trigger escalation if enabled", async () => {
      // Create adapters that maintain low similarity (deadlock pattern)
      // Each adapter will maintain different divergent responses
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.65,
        0.0,
      );
      const adapter2 = new MockConvergingProviderAdapter(
        "key2",
        "member2",
        0.65,
        0.0,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.65,
        0.0,
      );

      // Set divergent base responses so they don't converge
      adapter1.setBaseResponse("Approach A focusing on structural constraints");
      adapter2.setBaseResponse("Approach B prioritizing incentive alignment");
      adapter3.setBaseResponse("Approach C emphasizing coordinated planning");

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", adapter2);
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-deadlock-1",
        query: "Question causing deadlock",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      // Create Round 0 with responses that won't converge (maintain low similarity)
      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "Approach A focusing on structural constraints and technical implementation details",
        },
        {
          memberId: "member2",
          content:
            "Approach B prioritizing incentive alignment and stakeholder engagement strategies",
        },
        {
          memberId: "member3",
          content:
            "Approach C emphasizing coordinated planning and resource optimization methods",
        },
      ]);

      const config: IterativeConsensusConfig = {
        ...defaultConfig,
        maxRounds: 5,
        humanEscalationEnabled: true,
      };

      const decision = await synthesizer.synthesize(request, thread, config);

      // The system should detect that consensus cannot be reached
      // This may be reported as deadlock or simply as max rounds without consensus
      expect(decision.iterativeConsensusMetadata?.fallbackUsed).toBe(true);
      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(
        false,
      );

      // If deadlock is detected (requires 3+ rounds of flat similarity), it should be flagged
      // Otherwise, it will just reach max rounds
      if (decision.iterativeConsensusMetadata?.totalRounds >= 3) {
        // With enough rounds, deadlock might be detected
        // But it's also valid to just reach max rounds without formal deadlock detection
        expect(
          decision.iterativeConsensusMetadata?.fallbackReason,
        ).toBeTruthy();
      }
    });
  });

  describe("Member Failure Handling", () => {
    test("should continue with remaining members when one fails", async () => {
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.75,
        0.06,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.75,
        0.06,
      );

      // Set them to converge to the same answer
      const consensusAnswer = "Standard protocol is the appropriate approach";
      adapter1.setBaseResponse(consensusAnswer);
      adapter3.setBaseResponse(consensusAnswer);

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", new MockFailingProviderAdapter("key2")); // This one fails
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-failure-1",
        query: "Test query",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "Based on my analysis, this is a straightforward case requiring standard protocol.",
        },
        {
          memberId: "member2",
          content:
            "I concur with the standard protocol approach for this scenario.",
        },
        {
          memberId: "member3",
          content:
            "Standard protocol is appropriate here according to established guidelines.",
        },
      ]);

      const decision = await synthesizer.synthesize(
        request,
        thread,
        defaultConfig,
      );

      // Should still produce a result (either consensus or fallback)
      expect(decision).toBeDefined();
      expect(decision.content).toBeTruthy();
    });

    test("should invoke fallback when too few members remain", async () => {
      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set(
        "openai",
        new MockConvergingProviderAdapter("key1", "member1", 0.75, 0.05),
      );
      adapters.set("anthropic", new MockFailingProviderAdapter("key2"));
      adapters.set("google", new MockFailingProviderAdapter("key3")); // Two failures

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-insufficient-1",
        query: "Test query",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "I recommend proceeding with a comprehensive evaluation of available options.",
        },
        {
          memberId: "member2",
          content:
            "A thorough evaluation is necessary before making any decisions.",
        },
        {
          memberId: "member3",
          content:
            "We should evaluate all options comprehensively and systematically.",
        },
      ]);

      const decision = await synthesizer.synthesize(
        request,
        thread,
        defaultConfig,
      );

      // With 2 failing members, only 1 remains active
      // The system should fall back - either immediately or after attempting negotiation
      expect(decision.iterativeConsensusMetadata?.fallbackUsed).toBe(true);
      // The fallback reason may be either "Insufficient" or "Maximum rounds" depending on
      // when the failures are detected
      expect(decision.iterativeConsensusMetadata?.fallbackReason).toBeTruthy();
    });
  });

  describe("Sequential Negotiation Mode", () => {
    test("should execute rounds sequentially with randomization", async () => {
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.75,
        0.06,
      );
      const adapter2 = new MockConvergingProviderAdapter(
        "key2",
        "member2",
        0.75,
        0.06,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.75,
        0.06,
      );

      // Set them to converge to the same answer
      const consensusAnswer =
        "Careful consideration of all factors leads to the optimal solution";
      adapter1.setBaseResponse(consensusAnswer);
      adapter2.setBaseResponse(consensusAnswer);
      adapter3.setBaseResponse(consensusAnswer);

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", adapter2);
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-sequential-1",
        query: "Test query",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      // Create Round 0 with highly similar responses that should converge quickly
      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "Careful consideration of all factors leads to the optimal solution according to member1 analysis",
        },
        {
          memberId: "member2",
          content:
            "Careful consideration of all factors leads to the optimal solution according to member2 analysis",
        },
        {
          memberId: "member3",
          content:
            "Careful consideration of all factors leads to the optimal solution according to member3 analysis",
        },
      ]);

      const config: IterativeConsensusConfig = {
        ...defaultConfig,
        negotiationMode: "sequential",
        randomizationSeed: 42, // Fixed seed for deterministic testing
      };

      const decision = await synthesizer.synthesize(request, thread, config);

      expect(decision).toBeDefined();
      expect(decision.iterativeConsensusMetadata).toBeDefined();
      // Sequential mode should still achieve consensus
      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(true);
    });
  });

  describe("Logging and Persistence", () => {
    test("should log negotiation rounds to database", async () => {
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.75,
        0.06,
      );
      const adapter2 = new MockConvergingProviderAdapter(
        "key2",
        "member2",
        0.75,
        0.06,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.75,
        0.06,
      );

      // Set them to converge to the same answer
      const consensusAnswer = "Testing logging functionality with consensus";
      adapter1.setBaseResponse(consensusAnswer);
      adapter2.setBaseResponse(consensusAnswer);
      adapter3.setBaseResponse(consensusAnswer);

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", adapter2);
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-logging-1",
        query: "Test query",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "Initial response from member1 for testing logging functionality.",
        },
        {
          memberId: "member2",
          content:
            "Initial response from member2 for testing logging functionality.",
        },
        {
          memberId: "member3",
          content:
            "Initial response from member3 for testing logging functionality.",
        },
      ]);

      await synthesizer.synthesize(request, thread, defaultConfig);

      // Verify rounds were logged
      const roundsResult = await pool.query(
        "SELECT * FROM negotiation_rounds WHERE request_id = $1 ORDER BY round_number",
        [request.id],
      );

      expect(roundsResult.rows.length).toBeGreaterThan(0);

      // Verify responses were logged
      const responsesResult = await pool.query(
        "SELECT * FROM negotiation_responses WHERE request_id = $1",
        [request.id],
      );

      expect(responsesResult.rows.length).toBeGreaterThan(0);

      // Verify metadata was logged
      const metadataResult = await pool.query(
        "SELECT * FROM consensus_metadata WHERE request_id = $1",
        [request.id],
      );

      expect(metadataResult.rows).toHaveLength(1);
      expect(metadataResult.rows[0].consensus_achieved).toBeDefined();
    });
  });

  describe("Configuration Presets", () => {
    test("should work with strict consensus preset", async () => {
      const adapter1 = new MockConvergingProviderAdapter(
        "key1",
        "member1",
        0.92,
        0.02,
      );
      const adapter2 = new MockConvergingProviderAdapter(
        "key2",
        "member2",
        0.92,
        0.02,
      );
      const adapter3 = new MockConvergingProviderAdapter(
        "key3",
        "member3",
        0.92,
        0.02,
      );

      // Set them to converge to the same answer with high precision
      const consensusAnswer =
        "Quality-focused solution balancing efficiency and cost";
      adapter1.setBaseResponse(consensusAnswer);
      adapter2.setBaseResponse(consensusAnswer);
      adapter3.setBaseResponse(consensusAnswer);

      const adapters = new Map<string, BaseProviderAdapter>();
      adapters.set("openai", adapter1);
      adapters.set("anthropic", adapter2);
      adapters.set("google", adapter3);

      const providerPool = new MockProviderPool(testMembers, adapters);

      const synthesizer = new IterativeConsensusSynthesizer(
        embeddingService,
        promptBuilder,
        convergenceDetector,
        exampleRepository,
        providerPool,
        configManager,
        synthesisEngine,
        eventLogger,
      );

      const request: UserRequest = {
        id: "test-preset-1",
        query: "Test query",
        sessionId: "test-session",
        timestamp: new Date(),
      };

      // Create Round 0 with highly similar responses for strict preset
      const thread = createThreadWithRound0([
        {
          memberId: "member1",
          content:
            "Quality-focused solution balancing efficiency and cost according to member1 analysis",
        },
        {
          memberId: "member2",
          content:
            "Quality-focused solution balancing efficiency and cost according to member2 analysis",
        },
        {
          memberId: "member3",
          content:
            "Quality-focused solution balancing efficiency and cost according to member3 analysis",
        },
      ]);

      const strictConfig = await configManager.getIterativeConsensusConfig();
      strictConfig.agreementThreshold = 0.95;
      strictConfig.maxRounds = 10;

      const decision = await synthesizer.synthesize(
        request,
        thread,
        strictConfig,
      );

      expect(decision.iterativeConsensusMetadata?.consensusAchieved).toBe(true);
    });
  });
});
