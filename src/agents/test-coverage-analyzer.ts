import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt.js';

/**
 * Test Coverage Analyzer Subagent
 * Evaluates test completeness, identifies untested execution paths, and suggests specific test cases.
 */
export const testCoverageAnalyzer: AgentDefinition = {
  description: 'Evaluates automated test completeness, discovers missing test paths and edge cases, and provides concrete test proposals.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  model: 'inherit',
  tools: ['Skill', 'Read', 'Grep', 'Glob', 'mcp__github__pull_request_read', 'mcp__github__get_file_contents']
};
