import * as dotenv from 'dotenv';
dotenv.config();

import { query } from '@anthropic-ai/claude-agent-sdk';
import { mcpServersConfig } from './config/mcp.config.js';
import { subagents } from './agents/index.js';
import { buildOrchestratorPrompt } from './prompts/orchestrator.prompt.js';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/index.js';
import {
  logger,
  logReviewStart,
  logReviewComplete,
  logReviewError,
  RateLimiter,
  RateLimiterConfig,
  ReviewError,
  ErrorCodes,
  withTimeout
} from './utils/index.js';
import path from 'path';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
  rateLimiter?: RateLimiter;
  rateLimitConfig?: Partial<RateLimiterConfig>;
  timeoutMs?: number;
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk';
  projectRoot?: string;
  cwd?: string;
}

/**
 * Async generator helper for SDK streaming input
 */
async function* generateMessages(userMessage: string, sessionId: string) {
  yield {
    type: 'user' as const,
    message: { role: 'user' as const, content: userMessage },
    parent_tool_use_id: null,
    session_id: sessionId
  };
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  public options: OrchestratorOptions;
  public rateLimiter: RateLimiter;
  public model: string;
  public maxTurns: number;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;
    this.model = options.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
    this.maxTurns = options.maxTurns ?? 25;

    if (options.rateLimiter) {
      this.rateLimiter = options.rateLimiter;
    } else if (options.rateLimitConfig) {
      this.rateLimiter = new RateLimiter(options.rateLimitConfig);
    } else {
      this.rateLimiter = new RateLimiter();
    }
  }

  /**
   * Review a pull request using multi-agent analysis
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report matching ReviewReport schema
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    if (!owner || !repo || !Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error('Invalid pull request information.');
    }

    const startTime = Date.now();
    logReviewStart(owner, repo, prNumber);

    const projectRoot =
      this.options.projectRoot ||
      process.env.PROJECT_ROOT ||
      process.cwd();

    const sessionId = `code-review-${owner}-${repo}-${prNumber}-${Date.now()}`;
    const promptText = buildOrchestratorPrompt(owner, repo, prNumber);

    await this.rateLimiter.acquire(2000);

    const executeReview = async (): Promise<ReviewReport> => {
      let finalReport: ReviewReport | null = null;

      try {
        const queryParams = {
          prompt: promptText,
          options: {
            model: this.model,
            maxTurns: this.maxTurns,
            allowedTools: [
              'Task',
              'mcp__github__pull_request_read',
              'mcp__github__get_file_contents',
              'Skill',
              'mcp__github__*',
              'mcp__eslint__*'
            ],
            agents: subagents,
            mcpServers: mcpServersConfig,
            cwd: projectRoot,
            settingSources: ['project'] as ('project' | 'user' | 'local')[],
            permissionMode: this.options.permissionMode || 'default',
            outputFormat: {
              type: 'json_schema' as const,
              schema: ReviewReportJSONSchema
            }
          }
        };

        for await (const message of query(queryParams)) {
          if (message.type === 'system' && message.subtype === 'init') {
            logger.info('Initialized multi-agent review session', {
              mcpServers: message.mcp_servers
            });
          } else if (message.type === 'assistant') {
            const content = message.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_use') {
                  if (block.name === 'Task') {
                    const taskInput = block.input as { description?: string; subagent_type?: string };
                    logger.info(`[Orchestrator] Spawning subagent: ${taskInput.subagent_type || taskInput.description || 'task'}`);
                  } else {
                    logger.debug(`[Orchestrator] Tool invocation: ${block.name}`);
                  }
                }
              }
            }
          } else if (message.type === 'result') {
            if (message.subtype === 'success' && message.structured_output) {
              const parseResult = ReviewReportSchema.safeParse(message.structured_output);
              if (parseResult.success) {
                finalReport = parseResult.data;
              } else {
                logger.error('Structured output failed Zod schema validation', {
                  errors: parseResult.error.errors
                });
                throw new ReviewError(
                  `Output validation failed: ${parseResult.error.message}`,
                  ErrorCodes.VALIDATION_FAILED,
                  { errors: parseResult.error.errors }
                );
              }
            } else if (message.subtype === 'error_max_turns') {
              throw new ReviewError('Code review failed: error_max_turns', ErrorCodes.AGENT_FAILED);
            } else if (message.subtype === 'error_max_structured_output_retries') {
              throw new ReviewError(
                'Code review failed: error_max_structured_output_retries',
                ErrorCodes.STRUCTURED_OUTPUT_FAILED
              );
            } else if (message.subtype !== 'success') {
              throw new ReviewError(
                `Code review failed: ${message.subtype}`,
                ErrorCodes.AGENT_FAILED
              );
            }
          }
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logReviewError(owner, repo, prNumber, error);
        throw error;
      }

      if (!finalReport) {
        const noReportError = new ReviewError(
          'No structured report generated from code review orchestrator',
          ErrorCodes.STRUCTURED_OUTPUT_FAILED
        );
        logReviewError(owner, repo, prNumber, noReportError);
        throw noReportError;
      }

      const duration = Date.now() - startTime;
      finalReport.metadata.duration = duration;
      logReviewComplete(
        owner,
        repo,
        prNumber,
        finalReport.summary.overallScore,
        duration
      );

      return finalReport;
    };

    try {
      if (this.options.timeoutMs) {
        return await withTimeout(executeReview, this.options.timeoutMs, 'Code review operation timed out');
      }
      return await executeReview();
    } finally {
      this.rateLimiter.release();
    }
  }
}

// Export alias for convenient import compatibility
export const Orchestrator = CodeReviewOrchestrator;
export default CodeReviewOrchestrator;
