import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CLAUDE_INSTRUCTIONS_FILE, saveRulesAppliedAt } from "./local-data.ts";
import { replaceRulesBlock } from "./rules-block.ts";

const rules = readFileSync(0, "utf-8");
const instructions = existsSync(CLAUDE_INSTRUCTIONS_FILE) ? readFileSync(CLAUDE_INSTRUCTIONS_FILE, "utf-8") : "";
writeFileSync(CLAUDE_INSTRUCTIONS_FILE, replaceRulesBlock(instructions, rules));
saveRulesAppliedAt(new Date());
console.log(`updated the agent-collab-metrics block in ${CLAUDE_INSTRUCTIONS_FILE}`);
