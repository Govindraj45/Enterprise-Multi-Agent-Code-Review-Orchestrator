import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt.js';

/**
 * Refactoring Suggester Subagent
 * Identifies opportunities to apply design patterns, modern language features, and code simplification.
 */
export const refactoringSuggester: AgentDefinition = {
  description: 'Recommends architectural refactoring, pattern modernizations, function extraction candidates, and code simplifications.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  model: 'inherit',
  tools: ['Skill', 'Read', 'Grep', 'Glob', 'mcp__github__pull_request_read', 'mcp__github__get_file_contents']
};
