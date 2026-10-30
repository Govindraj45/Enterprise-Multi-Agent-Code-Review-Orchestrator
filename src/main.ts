import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Orchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { logger } from './utils/logger.js';
import { formatError } from './utils/error-handler.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
export async function main() {
  const args = process.argv.slice(2);
  const [owner, repo, prStr] = args;

  // 1. Validate command line arguments
  if (!owner || !repo || !prStr) {
    console.error('❌ Error: Missing required command-line arguments.');
    console.error('Usage: npm run dev <owner> <repo> <pr-number>');
    console.error('Example: npm run dev udacity cd14715-simple-todo-app 1');
    process.exit(1);
  }

  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber) || prNumber <= 0 || !Number.isInteger(prNumber)) {
    console.error(`❌ Error: Invalid pull request number "${prStr}". It must be a positive integer.`);
    process.exit(1);
  }

  // 2. Validate authentication (choose ONE method)
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );

  if (hasAwsCredentials) {
    if (!process.env.AWS_REGION) {
      console.error('❌ Error: AWS credentials detected, but AWS_REGION environment variable is missing.');
      console.error('Please configure AWS_REGION (e.g., us-east-1).');
      process.exit(1);
    }
    console.log('🔐 Using AWS Bedrock authentication');
  } else if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else {
    console.error('❌ Error: No valid authentication credentials found.');
    console.error('Please configure ONE of the following authentication methods:');
    console.error('  1. Anthropic API Key:');
    console.error('     export ANTHROPIC_API_KEY="sk-ant-..."');
    console.error('  2. AWS Bedrock Credentials:');
    console.error('     export AWS_ACCESS_KEY_ID="..."');
    console.error('     export AWS_SECRET_ACCESS_KEY="..."');
    console.error('     export AWS_REGION="us-east-1"');
    process.exit(1);
  }

  // 3. Validate ANTHROPIC_MODEL environment variable
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error('❌ Error: ANTHROPIC_MODEL environment variable is required but not set.');
    console.error('Please set ANTHROPIC_MODEL in your environment or .env file:');
    console.error('  - For Anthropic API: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929');
    console.error('  - For AWS Bedrock:   ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    process.exit(1);
  }

  console.log(`🚀 Starting code review for ${owner}/${repo} PR #${prNumber} using model ${model}...`);

  try {
    const orchestrator = new Orchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    // 4. Generate formatted reports using ReportGenerator
    const generator = new ReportGenerator();
    const markdownReport = generator.generateMarkdownReport(report);
    const htmlReport = generator.generateHTMLReport(report);
    const jsonReport = generator.generateJSONReport(report);

    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const baseName = `${owner}_${repo}_${prNumber}`;
    const mdPath = path.join(reportsDir, `${baseName}.md`);
    const htmlPath = path.join(reportsDir, `${baseName}.html`);
    const jsonPath = path.join(reportsDir, `${baseName}.json`);

    fs.writeFileSync(mdPath, markdownReport, 'utf8');
    fs.writeFileSync(htmlPath, htmlReport, 'utf8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf8');

    console.log('✅ Code review completed successfully!');
    console.log(`📄 Markdown report saved to: ${mdPath}`);
    console.log(`🌐 HTML report saved to:     ${htmlPath}`);
    console.log(`📊 JSON report saved to:     ${jsonPath}`);
    console.log(`\nOverall Score: ${report.summary.overallScore}/100 | Files Reviewed: ${report.summary.totalFiles}`);
  } catch (error) {
    const formatted = formatError(error);
    console.error(`❌ Review failed: ${formatted}`);
    logger.error('Review execution error', { error: formatted });
    process.exit(1);
  }
}

// Only run immediately if invoked directly
if (process.argv[1] && process.argv[1].endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  main();
}
