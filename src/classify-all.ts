import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readSessions } from "./claude-code.ts";
import { classifyReaction, collectPromptsAfterReplies, type PromptWithReply } from "./reaction-classifier.ts";

const PROJECTS_DIRECTORY = join(homedir(), ".claude", "projects");
const DEFAULT_OUTPUT_FILE = join("data", "reactions.jsonl");
const PROGRESS_INTERVAL = 100;
const CODE_BLOCK_PATTERN = /```.*?```/gs;
const ENGLISH_TERM_PATTERN = /[A-Za-z][A-Za-z_]{2,}/g;

function describeReply(agentReply: string) {
  const prose = agentReply.replace(CODE_BLOCK_PATTERN, "");
  return {
    replyCharacters: agentReply.length,
    replyHasCodeBlock: agentReply.includes("```"),
    replyEnglishTerms: (prose.match(ENGLISH_TERM_PATTERN) ?? []).length,
  };
}

async function reactionRecord(promptWithReply: PromptWithReply) {
  const reaction = await classifyReaction(promptWithReply);
  return {
    projectDirectory: promptWithReply.projectDirectory,
    sessionId: promptWithReply.sessionId,
    promptTime: promptWithReply.promptTime,
    label: reaction.label,
    confidence: reaction.confidence,
    ...describeReply(promptWithReply.agentReply),
  };
}

const outputFile = process.argv[2] ?? DEFAULT_OUTPUT_FILE;
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, "");
const allPrompts = readSessions(PROJECTS_DIRECTORY).flatMap(collectPromptsAfterReplies);
const startedAt = Date.now();
for (const [index, promptWithReply] of allPrompts.entries()) {
  appendFileSync(outputFile, JSON.stringify(await reactionRecord(promptWithReply)) + "\n");
  if ((index + 1) % PROGRESS_INTERVAL === 0) {
    console.log(`${index + 1}/${allPrompts.length} ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }
}
console.log(`done: ${allPrompts.length} records in ${outputFile}`);
