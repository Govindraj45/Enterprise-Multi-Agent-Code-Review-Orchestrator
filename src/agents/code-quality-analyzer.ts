import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt.js';

/**
 * Code Quality Analyzer Subagent
 * Analyzes code for security vulnerabilities, performance issues, and maintainability concerns.
 * Uses the Skill tool to leverage domain skills such as javascript-best-practices.
 */
export const codeQualityAnalyzer: AgentDefinition = {
  description: 'Analyzes source code for security vulnerabilities, performance bottlenecks, code smells, and adherence to best practices.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  model: 'inherit',
  tools: ['Skill', 'Read', 'Grep', 'Glob', 'mcp__github__pull_request_read', 'mcp__github__get_file_contents', 'mcp__eslint__*']
};
