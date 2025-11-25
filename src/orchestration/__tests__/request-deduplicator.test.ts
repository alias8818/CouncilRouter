/**
 * Request Deduplicator Tests
 * Verifies that duplicate requests are properly prevented
 */

import { RequestDeduplicator } from '../request-deduplicator';
import { CouncilMember } from '../../types/core';

describe('RequestDeduplicator', () => {
    let deduplicator: RequestDeduplicator;

    beforeEach(() => {
        deduplicator = new RequestDeduplicator();
    });

    afterEach(() => {
        deduplicator.clear();
    });

    const createMockMember = (id: string): CouncilMember => ({
        id,
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        timeout: 30,
        retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
        }
    });

    test('should execute request normally when no duplicates', async () => {
        const member = createMockMember('member-1');
        const requestId = 'request-1';
        const prompt = 'Test prompt';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            return 'result';
        };

        const result = await deduplicator.executeWithDeduplication(
            requestId,
            member,
            prompt,
            executor
        );

        expect(result).toBe('result');
        expect(executionCount).toBe(1);
    });

    test('should reuse in-flight request for duplicate calls', async () => {
        const member = createMockMember('member-1');
        const requestId = 'request-1';
        const prompt = 'Test prompt';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
            return 'result';
        };

        // Start two requests concurrently with same parameters
        const [result1, result2] = await Promise.all([
            deduplicator.executeWithDeduplication(requestId, member, prompt, executor),
            deduplicator.executeWithDeduplication(requestId, member, prompt, executor)
        ]);

        expect(result1).toBe('result');
        expect(result2).toBe('result');
        expect(executionCount).toBe(1); // Should only execute once
    });

    test('should execute separately for different members', async () => {
        const member1 = createMockMember('member-1');
        const member2 = createMockMember('member-2');
        const requestId = 'request-1';
        const prompt = 'Test prompt';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            return 'result';
        };

        await Promise.all([
            deduplicator.executeWithDeduplication(requestId, member1, prompt, executor),
            deduplicator.executeWithDeduplication(requestId, member2, prompt, executor)
        ]);

        expect(executionCount).toBe(2); // Should execute for each member
    });

    test('should execute separately for different prompts', async () => {
        const member = createMockMember('member-1');
        const requestId = 'request-1';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            return 'result';
        };

        await Promise.all([
            deduplicator.executeWithDeduplication(requestId, member, 'prompt-1', executor),
            deduplicator.executeWithDeduplication(requestId, member, 'prompt-2', executor)
        ]);

        expect(executionCount).toBe(2); // Should execute for each prompt
    });

    test('should execute separately for different request IDs', async () => {
        const member = createMockMember('member-1');
        const prompt = 'Test prompt';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            return 'result';
        };

        await Promise.all([
            deduplicator.executeWithDeduplication('request-1', member, prompt, executor),
            deduplicator.executeWithDeduplication('request-2', member, prompt, executor)
        ]);

        expect(executionCount).toBe(2); // Should execute for each request
    });

    test('should clean up after request completes', async () => {
        const member = createMockMember('member-1');
        const requestId = 'request-1';
        const prompt = 'Test prompt';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            return 'result';
        };

        // First request
        await deduplicator.executeWithDeduplication(requestId, member, prompt, executor);
        expect(deduplicator.getInFlightCount()).toBe(0); // Should be cleaned up

        // Second request with same parameters should execute again
        await deduplicator.executeWithDeduplication(requestId, member, prompt, executor);
        expect(executionCount).toBe(2); // Should execute twice
    });

    test('should clean up even on error', async () => {
        const member = createMockMember('member-1');
        const requestId = 'request-1';
        const prompt = 'Test prompt';

        const executor = async () => {
            throw new Error('Test error');
        };

        await expect(
            deduplicator.executeWithDeduplication(requestId, member, prompt, executor)
        ).rejects.toThrow('Test error');

        expect(deduplicator.getInFlightCount()).toBe(0); // Should be cleaned up
    });

    test('should handle multiple concurrent requests with different parameters', async () => {
        const members = [
            createMockMember('member-1'),
            createMockMember('member-2'),
            createMockMember('member-3')
        ];
        const requestId = 'request-1';
        const prompts = ['prompt-1', 'prompt-2', 'prompt-3'];

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'result';
        };

        // Create 9 requests (3 members x 3 prompts)
        const requests = [];
        for (const member of members) {
            for (const prompt of prompts) {
                requests.push(
                    deduplicator.executeWithDeduplication(requestId, member, prompt, executor)
                );
            }
        }

        await Promise.all(requests);

        expect(executionCount).toBe(9); // Should execute all unique combinations
        expect(deduplicator.getInFlightCount()).toBe(0); // All cleaned up
    });

    test('should handle rapid sequential requests', async () => {
        const member = createMockMember('member-1');
        const requestId = 'request-1';
        const prompt = 'Test prompt';

        let executionCount = 0;
        const executor = async () => {
            executionCount++;
            return 'result';
        };

        // Execute 10 requests sequentially
        for (let i = 0; i < 10; i++) {
            await deduplicator.executeWithDeduplication(requestId, member, prompt, executor);
        }

        expect(executionCount).toBe(10); // Should execute all since they're sequential
    });
});
