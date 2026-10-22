import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { readSessions } from "./claude-code.ts";
import { PROJECTS_DIRECTORY, REACTIONS_FILE, readModelName } from "./local-data.ts";
import { collectPromptsAfterReplies, reactionRecord } from "./reaction-classifier.ts";

const PROGRESS_INTERVAL = 100;

const { values: options, positionals } = parseArgs({ options: { latest: { type: "string" } }, allowPositionals: true });
const outputFile = positionals[0] ?? REACTIONS_FILE;
const modelName = readModelName();
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, "");
const allPrompts = readSessions(PROJECTS_DIRECTORY)
  .flatMap(collectPromptsAfterReplies)
  .sort((left, right) => left.promptTime.getTime() - right.promptTime.getTime());
const promptsToClassify = options.latest ? allPrompts.slice(-Number(options.latest)) : allPrompts;
const startedAt = Date.now();
for (const [index, promptWithReply] of promptsToClassify.entries()) {
  appendFileSync(outputFile, JSON.stringify(await reactionRecord(promptWithReply, modelName)) + "\n");
  if ((index + 1) % PROGRESS_INTERVAL === 0) {
    console.log(`${index + 1}/${promptsToClassify.length} ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }
}
console.log(`done: ${promptsToClassify.length} records in ${outputFile}`);
