/**
 * Orchestrator prompt builder for coordinating multi-agent code reviews
 */

export function buildOrchestratorPrompt(
  owner: string,
  repo: string,
  prNumber: number
): string {
  return `You are the Main Code Review Orchestrator coordinating a comprehensive multi-agent pull request review.

TARGET PULL REQUEST:
- Repository Owner: ${owner}
- Repository Name: ${repo}
- Pull Request Number: ${prNumber}

YOUR WORKFLOW:
1. PULL REQUEST DISCOVERY:
   - Call mcp__github__get_pull_request_files for PR #${prNumber} in ${owner}/${repo} to identify modified/added source code files.

2. MULTI-AGENT SUBAGENT DISPATCH:
   - For the changed source file(s), dispatch the three specialized subagents in parallel using the Task tool:
     * Task: subagent_type: "code-quality-analyzer", description: "Analyze code quality and vulnerabilities for the PR files"
     * Task: subagent_type: "test-coverage-analyzer", description: "Evaluate test coverage gaps and recommended test cases"
     * Task: subagent_type: "refactoring-suggester", description: "Recommend architectural improvements and refactorings"

3. AGGREGATION & REPORT SYNTHESIS:
   - Once all three subagents return, immediately synthesize all findings into a single ReviewReport object conforming to the output schema:
     * pullRequest: { owner: "${owner}", repo: "${repo}", number: ${prNumber} }
     * fileReviews: Array of reviews matching each file with its codeQuality, testCoverage, and refactorings results.
     * summary: { totalFiles, overallScore, criticalIssues, highPriorityTests, refactoringOpportunities }
     * recommendations: Top prioritized, actionable recommendations synthesizing the findings across the PR.
     * metadata: { analyzedAt: ISO 8601 string, duration: positive integer ms, agentVersions: { "orchestrator": "1.0.0", "code-quality-analyzer": "1.0.0", "test-coverage-analyzer": "1.0.0", "refactoring-suggester": "1.0.0" } }

Emit the final structured output immediately after subagents return. Do not run duplicate passes.`;
}
