import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readEvents } from "../src/claude-code.ts";

function sessionLine(recordType: string, content: unknown, overrides: object = {}): string {
  return JSON.stringify({
    type: recordType,
    timestamp: "2026-10-21T10:00:00.000Z",
    sessionId: "session-1",
    cwd: "/work/project",
    gitBranch: "main",
    message: { role: recordType, content },
    ...overrides,
  });
}

function read(...lines: string[]) {
  const sessionFile = join(mkdtempSync(join(tmpdir(), "session-")), "session.jsonl");
  writeFileSync(sessionFile, lines.join("\n"));
  return readEvents(sessionFile);
}

test("string content is a user prompt", () => {
  const [event] = read(sessionLine("user", "fix the bug"));
  assert.deepEqual([event.kind, event.text, event.sessionId], ["user_prompt", "fix the bug", "session-1"]);
});

test("tool use keeps name and target", () => {
  const toolUse = { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/work/a.py" } };
  const [event] = read(sessionLine("assistant", [toolUse]));
  assert.deepEqual([event.kind, event.toolName, event.toolTarget], ["tool_use", "Read", "/work/a.py"]);
});

test("tool result marks failure", () => {
  const toolResult = { type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true };
  const [event] = read(sessionLine("user", [toolResult]));
  assert.deepEqual([event.kind, event.toolFailed], ["tool_result", true]);
});

test("thinking, meta and bookkeeping records are skipped", () => {
  const thinking = { type: "thinking", thinking: "hmm", signature: "x" };
  const events = read(
    sessionLine("assistant", [thinking]),
    sessionLine("user", "hidden", { isMeta: true }),
    JSON.stringify({ type: "last-prompt", lastPrompt: "x" }),
    "not json",
  );
  assert.deepEqual(events, []);
});

test("sidechain flag is kept", () => {
  const [event] = read(sessionLine("user", "subagent task", { isSidechain: true }));
  assert.equal(event.isSidechain, true);
});
