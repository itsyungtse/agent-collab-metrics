import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordsAfter,
  unclassifiedPrompts,
  type PromptWithReply,
  type ReactionRecord,
} from "../src/reaction-classifier.ts";

function promptWithReply(sessionId: string, promptTime: string): PromptWithReply {
  return { projectDirectory: "/work", sessionId, promptTime: new Date(promptTime), agentReply: "done", prompt: "ok" };
}

function record(sessionId: string, promptTime: string): ReactionRecord {
  return {
    projectDirectory: "/work",
    sessionId,
    promptTime,
    label: "accept",
    confidence: 0.9,
    replyCharacters: 4,
    replyHasCodeBlock: false,
    replyEnglishTerms: 1,
  };
}

test("prompts already in the records are skipped", () => {
  const prompts = [
    promptWithReply("session-1", "2026-10-21T10:00:00.000Z"),
    promptWithReply("session-1", "2026-10-21T10:05:00.000Z"),
    promptWithReply("session-2", "2026-10-21T10:00:00.000Z"),
  ];
  const remaining = unclassifiedPrompts(prompts, [record("session-1", "2026-10-21T10:00:00.000Z")]);
  assert.deepEqual(
    remaining.map((prompt) => [prompt.sessionId, prompt.promptTime.toISOString()]),
    [
      ["session-1", "2026-10-21T10:05:00.000Z"],
      ["session-2", "2026-10-21T10:00:00.000Z"],
    ],
  );
});

test("records after the last rules update are counted", () => {
  const records = [record("session-1", "2026-10-21T10:00:00.000Z"), record("session-1", "2026-10-22T10:00:00.000Z")];
  assert.equal(recordsAfter(records, new Date("2026-10-22T00:00:00.000Z")).length, 1);
  assert.equal(recordsAfter(records, null).length, 2);
});
