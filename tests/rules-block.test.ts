import assert from "node:assert/strict";
import { test } from "node:test";
import { replaceRulesBlock } from "../src/rules-block.ts";

const START = "<!-- agent-collab-metrics:start -->";
const END = "<!-- agent-collab-metrics:end -->";

test("empty instructions get only the block", () => {
  assert.equal(replaceRulesBlock("", "- rule one\n"), `${START}\n- rule one\n${END}\n`);
});

test("block is appended after existing instructions", () => {
  assert.equal(replaceRulesBlock("# Mine\n\nkeep this\n", "- rule"), `# Mine\n\nkeep this\n\n${START}\n- rule\n${END}\n`);
});

test("existing block is replaced and the text around it is kept", () => {
  const instructions = `# Mine\n\n${START}\n- old rule\n${END}\n\n## After\n`;
  assert.equal(replaceRulesBlock(instructions, "- new rule"), `# Mine\n\n${START}\n- new rule\n${END}\n\n## After\n`);
});

test("applying twice keeps a single block", () => {
  const once = replaceRulesBlock("# Mine\n", "- first");
  const twice = replaceRulesBlock(once, "- second");
  assert.equal(twice.split(START).length - 1, 1);
  assert.match(twice, /- second/);
  assert.doesNotMatch(twice, /- first/);
});
