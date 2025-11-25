/**
 * Property-Based Tests for Negotiation Prompt Builder
 * Feature: iterative-consensus
 */

import * as fc from "fast-check";
import { NegotiationPromptBuilder } from "../prompt-builder";
import {
  NegotiationResponse,
  Agreement,
  NegotiationExample,
} from "../../../types/core";

describe("NegotiationPromptBuilder - Property-Based Tests", () => {
  let builder: NegotiationPromptBuilder;

  beforeEach(() => {
    builder = new NegotiationPromptBuilder();
  });

  /**
   * Property 9: Prompt Context Completeness
   * For any negotiation prompt, it must include the original query, all current
   * responses with attribution, and at least one example (when available).
   * Validates: Requirements 3.1, 3.2, 3.7
   */
  describe("Property 9: Prompt Context Completeness", () => {
    it("should always include original query", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 500 }), (query) => {
          const prompt = builder.buildPrompt(query, [], [], [], []);

          expect(prompt).toContain("ORIGINAL QUERY");
          // The query will be sanitized before being added to the prompt
          // Check that the prompt contains a non-empty sanitized version
          const sanitizedQuery = query
            .substring(0, 2000)
            .replace(/```[\s\S]*?```/g, "[code block removed]")
            .replace(/`[^`]+`/g, "[code removed]")
            .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
            .replace(/ignore\s+(previous|all)\s+(instructions|prompts?)/gi, "")
            .replace(/forget\s+(everything|all)/gi, "")
            .replace(/system\s*:\s*/gi, "")
            .replace(
              /show\s+(me\s+)?(your|the)\s+(prompt|instructions|system)/gi,
              "",
            )
            .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g, "")
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();

          // Only check if sanitized query is non-empty
          if (sanitizedQuery.length > 0) {
            expect(prompt).toContain(sanitizedQuery);
          }
        }),
        { numRuns: 100 },
      );
    });

    it("should include all current responses with attribution", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              councilMemberId: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 1, maxLength: 500 }),
              roundNumber: fc.integer({ min: 0, max: 10 }),
              timestamp: fc.constant(new Date()),
              tokenCount: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          (responseData) => {
            const responses: NegotiationResponse[] = responseData.map(
              (data) => ({
                ...data,
                timestamp: new Date(),
              }),
            );

            const prompt = builder.buildPrompt(
              "test query",
              responses,
              [],
              [],
              [],
            );

            responses.forEach((response) => {
              expect(prompt).toContain(response.councilMemberId);
              expect(prompt).toContain(response.content);
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it("should include examples when available", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              category: fc.constantFrom(
                "endorsement",
                "refinement",
                "compromise",
              ),
              queryContext: fc.string({ minLength: 1, maxLength: 200 }),
              disagreement: fc.string({ minLength: 1, maxLength: 200 }),
              resolution: fc.string({ minLength: 1, maxLength: 200 }),
              roundsToConsensus: fc.integer({ min: 1, max: 10 }),
              finalSimilarity: fc.float({
                min: Math.fround(0.7),
                max: Math.fround(1.0),
              }),
              createdAt: fc.constant(new Date()),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (exampleData) => {
            const examples: NegotiationExample[] = exampleData.map((data) => ({
              ...data,
              createdAt: new Date(),
            }));

            const prompt = builder.buildPrompt(
              "test query",
              [],
              [],
              [],
              examples,
            );

            expect(prompt).toContain("EXAMPLE NEGOTIATIONS");
            // Should include at least the first example
            if (examples.length > 0) {
              expect(prompt).toContain(examples[0].category);
              expect(prompt).toContain(examples[0].disagreement);
              expect(prompt).toContain(examples[0].resolution);
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    it("should include disagreements when present", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 10, maxLength: 200 }), {
            minLength: 1,
            maxLength: 10,
          }),
          (disagreements) => {
            const prompt = builder.buildPrompt(
              "test query",
              [],
              disagreements,
              [],
              [],
            );

            expect(prompt).toContain("IDENTIFIED DISAGREEMENTS");
            disagreements.forEach((disagreement) => {
              expect(prompt).toContain(disagreement);
            });
          },
        ),
        { numRuns: 50 },
      );
    });

    it("should include agreements when present", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              memberIds: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
                minLength: 2,
                maxLength: 5,
              }),
              position: fc.string({ minLength: 1, maxLength: 200 }),
              cohesion: fc.float({
                min: Math.fround(0.7),
                max: Math.fround(1.0),
              }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (agreementData) => {
            const agreements: Agreement[] = agreementData;

            const prompt = builder.buildPrompt(
              "test query",
              [],
              [],
              agreements,
              [],
            );

            expect(prompt).toContain("EXISTING AGREEMENTS");
            agreements.forEach((agreement) => {
              agreement.memberIds.forEach((memberId) => {
                expect(prompt).toContain(memberId);
              });
              expect(prompt).toContain(agreement.position);
            });
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
