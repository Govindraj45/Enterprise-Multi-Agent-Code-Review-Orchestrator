import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  ReviewReportSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema,
  ReviewReportJSONSchema
} from '../src/types/index.js';

describe('Schema Validation Tests', () => {
  describe('CodeQualityResultSchema', () => {
    it('accepts valid code quality data', () => {
      const validData = {
        file: 'src/index.ts',
        issues: [
          {
            line: 42,
            severity: 'high' as const,
            category: 'security' as const,
            description: 'Potential XSS vulnerability in DOM update',
            suggestion: 'Use textContent instead of innerHTML'
          }
        ],
        overallScore: 85,
        summary: 'Good code overall with one security issue to fix.'
      };

      const result = CodeQualityResultSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('accepts edge cases such as empty issues array and boundary scores', () => {
      const scoreZero = {
        file: 'src/empty.ts',
        issues: [],
        overallScore: 0,
        summary: 'Completely broken file'
      };
      expect(() => CodeQualityResultSchema.parse(scoreZero)).not.toThrow();

      const scoreHundred = {
        file: 'src/perfect.ts',
        issues: [],
        overallScore: 100,
        summary: 'Flawless file'
      };
      expect(() => CodeQualityResultSchema.parse(scoreHundred)).not.toThrow();
    });

    it('rejects invalid severity and category enum values', () => {
      const invalidData = {
        file: 'src/index.ts',
        issues: [
          {
            line: 10,
            severity: 'super-critical', // invalid enum
            category: 'security',
            description: 'bad',
            suggestion: 'fix'
          }
        ],
        overallScore: 50,
        summary: 'broken'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('rejects scores out of bounds (<0 or >100)', () => {
      const negativeScore = {
        file: 'src/index.ts',
        issues: [],
        overallScore: -1,
        summary: 'Negative'
      };
      expect(() => CodeQualityResultSchema.parse(negativeScore)).toThrow(ZodError);

      const excessScore = {
        file: 'src/index.ts',
        issues: [],
        overallScore: 101,
        summary: 'Over 100'
      };
      expect(() => CodeQualityResultSchema.parse(excessScore)).toThrow(ZodError);
    });
  });

  describe('TestCoverageResultSchema', () => {
    it('accepts valid test coverage data', () => {
      const validData = {
        file: 'src/utils/math.ts',
        hasTests: true,
        testFiles: ['tests/math.test.ts'],
        untestedPaths: [
          {
            type: 'branch' as const,
            location: 'divide(): line 14 zero-check branch',
            priority: 'critical' as const,
            reasoning: 'Division by zero is not covered',
            suggestedTest: 'it("throws error when dividing by zero", () => { ... })'
          }
        ],
        coverageEstimate: 75,
        summary: 'Core paths covered, error branches need tests.'
      };

      const result = TestCoverageResultSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('accepts edge cases with no tests and 0% coverage', () => {
      const edgeData = {
        file: 'src/legacy.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 0,
        summary: 'No tests exist yet.'
      };
      expect(() => TestCoverageResultSchema.parse(edgeData)).not.toThrow();
    });

    it('rejects missing required fields and invalid path types', () => {
      const invalid = {
        file: 'src/app.ts',
        hasTests: 'yes', // should be boolean
        testFiles: ['tests/app.test.ts'],
        untestedPaths: []
      };
      expect(() => TestCoverageResultSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe('RefactoringSuggestionSchema', () => {
    it('accepts valid refactoring suggestions', () => {
      const validData = {
        file: 'src/service.ts',
        suggestions: [
          {
            type: 'extract-function' as const,
            location: 'processOrder(): lines 20-55',
            impact: 'high' as const,
            description: 'Extract payment calculation logic into dedicated function',
            before: 'for(let item of items) { total += item.price; }',
            after: 'const total = calculateTotal(items);',
            benefits: 'Improves testability and single responsibility principle'
          }
        ],
        summary: 'Identified opportunities to modularize large functions.'
      };

      const result = RefactoringSuggestionSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('accepts empty suggestions array', () => {
      const emptyData = {
        file: 'src/clean.ts',
        suggestions: [],
        summary: 'Code is clean and modular, no refactoring required.'
      };
      expect(() => RefactoringSuggestionSchema.parse(emptyData)).not.toThrow();
    });

    it('rejects invalid suggestion types or impact levels', () => {
      const invalid = {
        file: 'src/test.ts',
        suggestions: [
          {
            type: 'rewrite-all', // invalid enum
            location: 'global',
            impact: 'extreme', // invalid enum
            description: 'rewrite',
            before: '',
            after: '',
            benefits: ''
          }
        ],
        summary: 'invalid'
      };
      expect(() => RefactoringSuggestionSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe('ReviewReportSchema', () => {
    it('accepts complete aggregated review report', () => {
      const validReport = {
        pullRequest: {
          owner: 'udacity',
          repo: 'cd14715-simple-todo-app',
          number: 1
        },
        fileReviews: [
          {
            file: 'src/todo.ts',
            codeQuality: {
              file: 'src/todo.ts',
              issues: [
                {
                  line: 12,
                  severity: 'medium' as const,
                  category: 'style' as const,
                  description: 'Avoid var keyword',
                  suggestion: 'Use const or let'
                }
              ],
              overallScore: 90,
              summary: 'Minor style issue detected.'
            },
            testCoverage: {
              file: 'src/todo.ts',
              hasTests: true,
              testFiles: ['tests/todo.test.ts'],
              untestedPaths: [],
              coverageEstimate: 95,
              summary: 'Comprehensive test suite.'
            },
            refactorings: {
              file: 'src/todo.ts',
              suggestions: [
                {
                  type: 'modernize' as const,
                  location: 'line 15',
                  impact: 'low' as const,
                  description: 'Use optional chaining',
                  before: 'if (user && user.name)',
                  after: 'if (user?.name)',
                  benefits: 'Cleaner code'
                }
              ],
              summary: 'Modernize syntax.'
            }
          }
        ],
        summary: {
          totalFiles: 1,
          overallScore: 90,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 1
        },
        recommendations: [
          {
            priority: 'low' as const,
            category: 'modernize',
            description: 'Apply modern ES optional chaining in todo.ts',
            files: ['src/todo.ts']
          }
        ],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1250,
          agentVersions: {
            orchestrator: '1.0.0',
            'code-quality-analyzer': '1.0.0',
            'test-coverage-analyzer': '1.0.0',
            'refactoring-suggester': '1.0.0'
          }
        }
      };

      const parsed = ReviewReportSchema.parse(validReport);
      expect(parsed).toEqual(validReport);
    });

    it('rejects reports missing summary or recommendations', () => {
      const incomplete = {
        pullRequest: { owner: 'udacity', repo: 'app', number: 1 },
        fileReviews: []
      };
      expect(() => ReviewReportSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('JSON Schema Export Validation', () => {
    it('produces valid JSON Schema definitions for Claude Agent SDK', () => {
      expect(CodeQualityResultJSONSchema).toBeDefined();
      expect(typeof CodeQualityResultJSONSchema).toBe('object');

      expect(TestCoverageResultJSONSchema).toBeDefined();
      expect(typeof TestCoverageResultJSONSchema).toBe('object');

      expect(RefactoringSuggestionJSONSchema).toBeDefined();
      expect(typeof RefactoringSuggestionJSONSchema).toBe('object');

      expect(ReviewReportJSONSchema).toBeDefined();
      expect(typeof ReviewReportJSONSchema).toBe('object');
    });

    it('contains required properties in ReviewReportJSONSchema', () => {
      const schema = ReviewReportJSONSchema as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };

      expect(schema.properties).toBeDefined();
      expect(schema.properties).toHaveProperty('pullRequest');
      expect(schema.properties).toHaveProperty('fileReviews');
      expect(schema.properties).toHaveProperty('summary');
      expect(schema.properties).toHaveProperty('recommendations');
      expect(schema.properties).toHaveProperty('metadata');
    });
  });
});
