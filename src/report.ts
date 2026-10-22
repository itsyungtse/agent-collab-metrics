import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readSessions, type Event } from "./claude-code.ts";
import { median } from "./median.ts";
import { measureSession, withoutIdeContext, type SessionMetrics } from "./metrics.ts";
import { collectPromptsAfterReplies, type PromptWithReply } from "./reaction-classifier.ts";

const PROJECTS_DIRECTORY = join(homedir(), ".claude", "projects");
const DEFAULT_REACTIONS_FILE = join("data", "reactions.jsonl");
const MIN_RECORDS_PER_PROJECT = 20;
const LABELS = ["correction", "confusion", "accept", "new_request"];
const PROBLEM_LABELS = ["confusion", "correction"];
const MIN_PROBLEMS_PER_SESSION = 2;
const MAX_PROBLEM_SESSIONS = 10;

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    confidence: { type: "string", default: "0.8" },
    "quote-characters": { type: "string", default: "200" },
  },
});
const CONFIDENT_THRESHOLD = Number(options.confidence);
const QUOTE_CHARACTERS = Number(options["quote-characters"]);

interface Reaction {
  projectDirectory: string;
  sessionId: string;
  promptTime: string;
  label: string;
  confidence: number;
  replyCharacters: number;
  replyHasCodeBlock: boolean;
  replyEnglishTerms: number;
}

function readReactions(reactionsFile: string): Reaction[] {
  return readFileSync(reactionsFile, "utf-8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}

function countLabels(reactions: Reaction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { label } of reactions) counts[label] = (counts[label] ?? 0) + 1;
  return counts;
}

function printLabelRatesByProject(reactions: Reaction[]): void {
  const reactionsByProject = Map.groupBy(reactions, (reaction) => reaction.projectDirectory);
  console.log("label rates by project (projects with enough prompts)");
  const projectsByPromptCount = [...reactionsByProject].sort(([, left], [, right]) => right.length - left.length);
  for (const [projectDirectory, projectReactions] of projectsByPromptCount) {
    if (projectReactions.length < MIN_RECORDS_PER_PROJECT) continue;
    const counts = countLabels(projectReactions);
    const rates = LABELS.map((label) => `${label}=${Math.round(((counts[label] ?? 0) / projectReactions.length) * 100)}%`);
    console.log(`  ${projectDirectory} n=${projectReactions.length} ${rates.join(" ")}`);
  }
}

function describeReplies(label: string, reactions: Reaction[]): string {
  if (reactions.length === 0) return `  ${label}: no records`;
  const withCodeBlock = reactions.filter((reaction) => reaction.replyHasCodeBlock).length;
  return (
    `  ${label} n=${reactions.length}` +
    ` median_characters=${median(reactions.map((r) => r.replyCharacters)).toFixed(0)}` +
    ` with_code_block=${Math.round((withCodeBlock / reactions.length) * 100)}%` +
    ` median_english_terms=${median(reactions.map((r) => r.replyEnglishTerms)).toFixed(0)}`
  );
}

function printReplyTraits(reactions: Reaction[]): void {
  const confident = reactions.filter((reaction) => reaction.confidence >= CONFIDENT_THRESHOLD);
  console.log(
    `\nreply traits (only reactions with confidence >= ${CONFIDENT_THRESHOLD}, ${confident.length} of ${reactions.length})`,
  );
  for (const label of ["confusion", "correction", "accept", "new_request"]) {
    console.log(describeReplies(label, confident.filter((reaction) => reaction.label === label)));
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function describeProjectSessions(projectDirectory: string, sessions: SessionMetrics[]): string {
  const explorations = sessions.flatMap((session) => session.exploration ?? []);
  const medianToolCalls = explorations.length ? median(explorations.map((e) => e.toolCalls)) : "-";
  const medianFilesRead = explorations.length ? median(explorations.map((e) => e.filesRead)) : "-";
  return (
    `  ${projectDirectory} sessions=${sessions.length} turns=${sum(sessions.map((s) => s.turns))}` +
    ` median_turns=${median(sessions.map((s) => s.turns))}` +
    ` interruptions=${sum(sessions.map((s) => s.interruptions))}` +
    ` before_first_edit(n=${explorations.length}): median_tool_calls=${medianToolCalls} median_files_read=${medianFilesRead}`
  );
}

function printSessionMetricsByProject(allSessionEvents: Event[][]): void {
  const sessions = allSessionEvents
    .map(measureSession)
    .filter((session): session is SessionMetrics => session !== null && session.turns > 0);
  const sessionsByProject = Map.groupBy(sessions, (session) => session.projectDirectory);
  console.log("\nsession metrics by project (from session logs)");
  const projectsByTurns = [...sessionsByProject].sort(
    ([, left], [, right]) => sum(right.map((s) => s.turns)) - sum(left.map((s) => s.turns)),
  );
  for (const [projectDirectory, projectSessions] of projectsByTurns) {
    console.log(describeProjectSessions(projectDirectory, projectSessions));
  }
}

function promptKey(sessionId: string, promptTime: string): string {
  return `${sessionId} ${promptTime}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function printProblemQuote(problem: Reaction, promptWithReply: PromptWithReply | undefined): void {
  console.log(`    [${problem.label}] ${problem.promptTime}`);
  if (!promptWithReply) {
    console.log("      (no longer in the session logs)");
    return;
  }
  console.log(`      agent: …${oneLine(promptWithReply.agentReply).slice(-QUOTE_CHARACTERS)}`);
  console.log(`      user:  ${oneLine(withoutIdeContext(promptWithReply.prompt)).slice(0, QUOTE_CHARACTERS)}`);
}

function printProblemSessions(reactions: Reaction[], allSessionEvents: Event[][]): void {
  const promptsByKey = new Map(
    allSessionEvents
      .flatMap(collectPromptsAfterReplies)
      .map((promptWithReply) => [
        promptKey(promptWithReply.sessionId, promptWithReply.promptTime.toISOString()),
        promptWithReply,
      ]),
  );
  const problems = reactions.filter(
    (reaction) => PROBLEM_LABELS.includes(reaction.label) && reaction.confidence >= CONFIDENT_THRESHOLD,
  );
  const problemSessions = [...Map.groupBy(problems, (problem) => problem.sessionId)]
    .filter(([, sessionProblems]) => sessionProblems.length >= MIN_PROBLEMS_PER_SESSION)
    .sort(([, left], [, right]) => right.length - left.length)
    .slice(0, MAX_PROBLEM_SESSIONS);
  console.log(
    `\nsessions with the most ${PROBLEM_LABELS.join(" or ")}` +
      ` (confidence >= ${CONFIDENT_THRESHOLD}, at least ${MIN_PROBLEMS_PER_SESSION} per session)`,
  );
  for (const [sessionId, sessionProblems] of problemSessions) {
    console.log(`  ${sessionProblems[0].projectDirectory} session=${sessionId} ${JSON.stringify(countLabels(sessionProblems))}`);
    for (const problem of sessionProblems) {
      printProblemQuote(problem, promptsByKey.get(promptKey(sessionId, problem.promptTime)));
    }
  }
}

const reactions = readReactions(positionals[0] ?? DEFAULT_REACTIONS_FILE);
const allSessionEvents = readSessions(PROJECTS_DIRECTORY);
console.log(`${reactions.length} reactions: ${JSON.stringify(countLabels(reactions))}\n`);
printLabelRatesByProject(reactions);
printSessionMetricsByProject(allSessionEvents);
printReplyTraits(reactions);
printProblemSessions(reactions, allSessionEvents);
