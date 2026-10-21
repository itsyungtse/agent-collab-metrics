import { homedir } from "node:os";
import { join } from "node:path";
import { readSessions } from "./claude-code.ts";
import { median } from "./median.ts";
import { classifyReaction, collectPromptsAfterReplies } from "./reaction-classifier.ts";

const PROJECTS_DIRECTORY = join(homedir(), ".claude", "projects");
const DEFAULT_SAMPLE_SIZE = 200;
const RANDOM_SEED = 0;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<Item>(items: Item[], size: number): Item[] {
  const random = seededRandom(RANDOM_SEED);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, size);
}

const sampleSize = Number(process.argv[2] ?? DEFAULT_SAMPLE_SIZE);
const allPrompts = readSessions(PROJECTS_DIRECTORY).flatMap(collectPromptsAfterReplies);
const promptsToClassify = sample(allPrompts, sampleSize);

const secondsPerCall: number[] = [];
const labelCounts: Record<string, number> = {};
const startedAt = performance.now();
for (const promptWithReply of promptsToClassify) {
  const callStartedAt = performance.now();
  const { label } = await classifyReaction(promptWithReply);
  labelCounts[label] = (labelCounts[label] ?? 0) + 1;
  secondsPerCall.push((performance.now() - callStartedAt) / 1000);
}
const totalSeconds = (performance.now() - startedAt) / 1000;

console.log(`classified ${promptsToClassify.length} of ${allPrompts.length} prompts in ${totalSeconds.toFixed(1)}s`);
console.log(`per call: median=${median(secondsPerCall).toFixed(2)}s max=${Math.max(...secondsPerCall).toFixed(2)}s`);
console.log(
  `estimated for all ${allPrompts.length} prompts: ` +
    `${(((totalSeconds / promptsToClassify.length) * allPrompts.length) / 60).toFixed(1)} min`,
);
console.log(`labels: ${JSON.stringify(labelCounts)}`);
