import { readFileSync } from "node:fs";
import { join } from "node:path";
import { median } from "./median.ts";

const DEFAULT_REACTIONS_FILE = join("data", "reactions.jsonl");
const MIN_RECORDS_PER_PROJECT = 20;
const CONFIDENT_THRESHOLD = 0.8;
const LABELS = ["correction", "confusion", "accept", "new_request"];

interface Reaction {
  projectDirectory: string;
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

const reactions = readReactions(process.argv[2] ?? DEFAULT_REACTIONS_FILE);
console.log(`${reactions.length} reactions: ${JSON.stringify(countLabels(reactions))}\n`);
printLabelRatesByProject(reactions);
printReplyTraits(reactions);
