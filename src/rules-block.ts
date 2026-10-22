const BLOCK_START = "<!-- agent-collab-metrics:start -->";
const BLOCK_END = "<!-- agent-collab-metrics:end -->";

export function replaceRulesBlock(instructions: string, rules: string): string {
  const block = `${BLOCK_START}\n${rules.trim()}\n${BLOCK_END}`;
  const blockStartIndex = instructions.indexOf(BLOCK_START);
  const blockEndIndex = instructions.indexOf(BLOCK_END);
  if (blockStartIndex !== -1 && blockEndIndex > blockStartIndex) {
    return instructions.slice(0, blockStartIndex) + block + instructions.slice(blockEndIndex + BLOCK_END.length);
  }
  const existingInstructions = instructions.trimEnd();
  return existingInstructions ? `${existingInstructions}\n\n${block}\n` : `${block}\n`;
}
