import { appendFileSync, readFileSync } from "node:fs";
import { readEvents } from "./claude-code.ts";
import { REACTIONS_FILE, readModelName, readReactionRecords, readRulesAppliedAt } from "./local-data.ts";
import {
  collectPromptsAfterReplies,
  reactionRecord,
  recordsAfter,
  unclassifiedPrompts,
  type ReactionRecord,
} from "./reaction-classifier.ts";

const RULES_UPDATE_INTERVAL = 500;

const { transcript_path: transcriptPath } = JSON.parse(readFileSync(0, "utf-8"));
const records = readReactionRecords();
const promptsToClassify = unclassifiedPrompts(collectPromptsAfterReplies(readEvents(transcriptPath)), records);
const modelName = readModelName();
const newRecords: ReactionRecord[] = [];
try {
  for (const promptWithReply of promptsToClassify) {
    const record = await reactionRecord(promptWithReply, modelName);
    appendFileSync(REACTIONS_FILE, JSON.stringify(record) + "\n");
    newRecords.push(record);
  }
} catch {
  // Ollama is down or slow; the prompts left over are picked up at the next stop of this session.
}

const rulesAppliedAt = readRulesAppliedAt();
const countBefore = recordsAfter(records, rulesAppliedAt).length;
const countAfter = countBefore + recordsAfter(newRecords, rulesAppliedAt).length;
if (Math.floor(countAfter / RULES_UPDATE_INTERVAL) > Math.floor(countBefore / RULES_UPDATE_INTERVAL)) {
  const systemMessage =
    `agent-collab-metrics: ${countAfter} replies classified since the last rules update. ` +
    "Run /agent-collab-metrics rules to draft new rules for CLAUDE.md.";
  console.log(JSON.stringify({ systemMessage }));
}
