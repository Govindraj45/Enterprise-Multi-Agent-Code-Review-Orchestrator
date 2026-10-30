import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist query mock for Claude Agent SDK ES module compatibility
const { mockAgentQuery } = vi.hoisted(() => ({
  mockAgentQuery: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockAgentQuery,
}));

import { CodeReviewOrchestrator } from '../src/orchestrator.js';
import { ReviewReportSchema, type ReviewReport } from '../src/types/report-types.js';
import {
  withRetry,
  withTimeout,
  ErrorCodes,
  RateLimiter
} from '../src/utils/index.js';

// Helper to simulate asynchronous stream of SDK messages
async function* createMockMessageStream(...messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

// Canonical fixture representing a successful multi-agent code review
const sampleValidReport: ReviewReport = {
  pullRequest: {
    owner: 'octocat',
    repo: 'Hello-World',
    number: 1,
  },
  fileReviews: [
    {
      file: 'src/index.ts',
      codeQuality: {
        file: 'src/index.ts',
        issues: [],
        overallScore: 95,
        summary: 'Source code adheres to high standards and security best practices.',
      },
      testCoverage: {
        file: 'src/index.ts',
        hasTests: true,
        testFiles: ['tests/index.test.ts'],
        untestedPaths: [],
        coverageEstimate: 95,
        summary: 'Critical execution paths are adequately covered by unit tests.',
      },
      refactorings: {
        file: 'src/index.ts',
        suggestions: [],
        summary: 'No structural refactoring needed at this time.',
      },
    },
  ],
  summary: {
    totalFiles: 1,
    overallScore: 95,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [
    {
      priority: 'low',
      category: 'best-practice',
      description: 'Continue adhering to modular design principles.',
      files: ['src/index.ts'],
    },
  ],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 1500,
    agentVersions: {
      orchestrator: '1.0.0',
      codeQualityAnalyzer: '1.0.0',
      testCoverageAnalyzer: '1.0.0',
      refactoringSuggester: '1.0.0',
    },
  },
};

describe('CodeReviewOrchestrator', () => {
  beforeEach(() => {
    mockAgentQuery.mockReset();
  });

  describe('Configuration & Initialization', () => {
    it('initializes with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeDefined();
    });

    it('uses a custom model configuration when provided', async () => {
      mockAgentQuery.mockReturnValue(
        createMockMessageStream({
          type: 'result',
          subtype: 'success',
          structured_output: sampleValidReport,
        })
      );

      const customModel = 'claude-3-7-sonnet-custom';
      const orchestrator = new CodeReviewOrchestrator({ model: customModel });

      await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(mockAgentQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.any(String),
          options: expect.objectContaining({
            model: customModel,
          }),
        })
      );
    });

    it('rejects invalid pull request information', async () => {
      const orchestrator = new CodeReviewOrchestrator();

      await expect(
        orchestrator.reviewPullRequest('', 'Hello-World', 1)
      ).rejects.toThrow('Invalid pull request information.');

      await expect(
        orchestrator.reviewPullRequest('octocat', '', 1)
      ).rejects.toThrow('Invalid pull request information.');

      await expect(
        orchestrator.reviewPullRequest('octocat', 'Hello-World', -5)
      ).rejects.toThrow('Invalid pull request information.');

      expect(mockAgentQuery).not.toHaveBeenCalled();
    });

    it('configures the multi-agent review workflow and aggregates a valid report', async () => {
      mockAgentQuery.mockReturnValue(
        createMockMessageStream(
          {
            type: 'system',
            subtype: 'init',
            mcp_servers: ['github', 'eslint'],
          },
          {
            type: 'result',
            subtype: 'success',
            structured_output: sampleValidReport,
          }
        )
      );

      const orchestrator = new CodeReviewOrchestrator();
      const reviewResult = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(mockAgentQuery).toHaveBeenCalledTimes(1);

      const [invocationArgs] = mockAgentQuery.mock.calls[0];

      // Verify specialized subagents configuration
      expect(invocationArgs.options.agents).toEqual(
        expect.objectContaining({
          codeQualityAnalyzer: expect.any(Object),
          testCoverageAnalyzer: expect.any(Object),
          refactoringSuggester: expect.any(Object),
        })
      );

      // Verify allowed tools list
      expect(invocationArgs.options.allowedTools).toEqual(
        expect.arrayContaining([
          'Task',
          'mcp__github__pull_request_read',
          'mcp__github__get_file_contents',
          'Skill',
        ])
      );

      // Verify schema configuration
      expect(invocationArgs.options.outputFormat).toEqual(
        expect.objectContaining({
          type: 'json_schema',
        })
      );

      // Verify aggregated result structure
      expect(reviewResult.pullRequest.owner).toBe('octocat');
      expect(reviewResult.pullRequest.repo).toBe('Hello-World');
      expect(reviewResult.pullRequest.number).toBe(1);
      expect(reviewResult.fileReviews).toHaveLength(1);
      expect(ReviewReportSchema.safeParse(reviewResult).success).toBe(true);
    });

    it('throws when the Claude SDK returns a failed result', async () => {
      mockAgentQuery.mockReturnValue(
        createMockMessageStream({
          type: 'result',
          subtype: 'error_max_turns',
        })
      );

      const orchestrator = new CodeReviewOrchestrator();

      await expect(
        orchestrator.reviewPullRequest('octocat', 'Hello-World', 1)
      ).rejects.toThrow('Code review failed: error_max_turns');
    });
  });
});

describe('ReviewReportSchema Validation', () => {
  it('accepts a valid ReviewReport object', () => {
    const parseResult = ReviewReportSchema.safeParse(sampleValidReport);
    expect(parseResult.success).toBe(true);
  });

  it('rejects an invalid ReviewReport object', () => {
    const malformed = {
      ...sampleValidReport,
      pullRequest: { owner: '' }, // Missing required fields
    };
    const parseResult = ReviewReportSchema.safeParse(malformed);
    expect(parseResult.success).toBe(false);
  });

  it('rejects an overall score outside the valid range', () => {
    const outOfBounds = {
      ...sampleValidReport,
      fileReviews: [
        {
          ...sampleValidReport.fileReviews[0],
          codeQuality: {
            ...sampleValidReport.fileReviews[0].codeQuality,
            overallScore: 125, // Valid range is 0 to 100
          },
        },
      ],
    };
    const parseResult = ReviewReportSchema.safeParse(outOfBounds);
    expect(parseResult.success).toBe(false);
  });
});

describe('Resilience Utilities: withRetry', () => {
  it('returns successfully when the operation succeeds', async () => {
    const action = vi.fn().mockResolvedValue('operation-completed');
    const outcome = await withRetry(action, 3, 5);

    expect(outcome).toBe('operation-completed');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('retries after a transient failure and eventually succeeds', async () => {
    let attemptCount = 0;
    const transientAction = vi.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error('Temporary network glitch');
      }
      return 'recovered-successfully';
    });

    const outcome = await withRetry(transientAction, 3, 5);

    expect(outcome).toBe('recovered-successfully');
    expect(attemptCount).toBe(2);
  });

  it('throws RETRY_EXHAUSTED when all attempts fail', async () => {
    let callCount = 0;
    const persistentFailure = vi.fn().mockImplementation(async () => {
      callCount++;
      throw new Error('Persistent backend outage');
    });

    await expect(withRetry(persistentFailure, 2, 5)).rejects.toMatchObject({
      code: ErrorCodes.RETRY_EXHAUSTED,
    });

    expect(callCount).toBe(2);
  });
});

describe('Resilience Utilities: withTimeout', () => {
  it('returns when the operation completes before the timeout', async () => {
    const swiftAction = async () => 'timely-finish';
    const result = await withTimeout(swiftAction, 150);

    expect(result).toBe('timely-finish');
  });

  it('rejects when the operation exceeds the timeout', async () => {
    const sluggishAction = () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('eventual-finish'), 100);
      });

    await expect(
      withTimeout(sluggishAction, 10, 'Custom timeout exceeded')
    ).rejects.toMatchObject({
      code: ErrorCodes.AGENT_TIMEOUT,
      message: 'Custom timeout exceeded',
    });
  });
});

describe('Traffic Control: RateLimiter', () => {
  it('allows a request within the configured limits', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 5,
      maxTokensPerMinute: 2000,
      maxConcurrent: 2,
    });

    expect(limiter.canProceed(150)).toBe(true);

    await limiter.acquire(150);

    const stats = limiter.getStatus();
    expect(stats.activeRequests).toBe(1);
    expect(stats.requestsInWindow).toBe(1);
    expect(stats.tokensInWindow).toBe(150);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('blocks new requests when the concurrent limit is reached', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 20,
      maxTokensPerMinute: 10000,
      maxConcurrent: 1,
    });

    await limiter.acquire(50);
    expect(limiter.canProceed(50)).toBe(false);

    limiter.release();
    expect(limiter.canProceed(50)).toBe(true);
  });

  it('tracks the configured request and token limits', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 1,
      maxTokensPerMinute: 100,
      maxConcurrent: 3,
    });

    await limiter.acquire(100);
    expect(limiter.canProceed(10)).toBe(false);

    const metrics = limiter.getStatus();
    expect(metrics.requestsInWindow).toBe(1);
    expect(metrics.tokensInWindow).toBe(100);

    limiter.release();
  });
});

describe('End-to-End Integration (Manual Test Suite)', () => {
  it.skip('reviews a real public pull request against live API', async () => {
    const orchestrator = new CodeReviewOrchestrator();
    const result = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

    expect(ReviewReportSchema.safeParse(result).success).toBe(true);
  });
});
