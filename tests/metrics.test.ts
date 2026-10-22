import assert from "node:assert/strict";
import { test } from "node:test";
import type { Event } from "../src/claude-code.ts";
import {
  isHumanPrompt,
  measureExplorationBeforeFirstEdit,
  measureSession,
} from "../src/metrics.ts";

const START = new Date("2026-10-21T10:00:00Z").getTime();

function event(kind: Event["kind"], seconds: number, fields: Partial<Event> = {}): Event {
  return {
    sessionId: "session-1",
    projectDirectory: "/work/project",
    gitBranch: "main",
    timestamp: new Date(START + seconds * 1000),
    kind,
    isSidechain: false,
    toolName: "",
    toolTarget: "",
    toolFailed: false,
    text: "",
    ...fields,
  };
}

const prompt = (text: string, seconds = 0, fields: Partial<Event> = {}) =>
  event("user_prompt", seconds, { text, ...fields });
const tool = (toolName: string, toolTarget = "", seconds = 0) =>
  event("tool_use", seconds, { toolName, toolTarget });

test("system injected text is not a human prompt", () => {
  assert.equal(isHumanPrompt(prompt("<task-notification>done</task-notification>")), false);
  assert.equal(isHumanPrompt(prompt("<ide_opened_file>a.py</ide_opened_file>")), false);
  assert.equal(isHumanPrompt(prompt("[Request interrupted by user]")), false);
});

test("ide context followed by text is a human prompt", () => {
  assert.equal(isHumanPrompt(prompt("<ide_selection>x</ide_selection>\nwhat is this")), true);
});

test("subagent prompt is not a human prompt", () => {
  assert.equal(isHumanPrompt(prompt("do the task", 0, { isSidechain: true })), false);
});

test("exploration counts tool calls and distinct files before first edit", () => {
  const sessionEvents = [
    prompt("fix it"),
    tool("Read", "/a.py", 5),
    tool("Read", "/a.py", 6),
    tool("Bash", "ls", 7),
    tool("Edit", "/a.py", 20),
    tool("Read", "/b.py", 30),
  ];
  assert.deepEqual(measureExplorationBeforeFirstEdit(sessionEvents), { toolCalls: 3, filesRead: 1, seconds: 20 });
});

test("exploration is null when the session never edits", () => {
  assert.equal(measureExplorationBeforeFirstEdit([prompt("explain"), tool("Read", "/a.py", 1)]), null);
});

test("session metrics count turns and interruptions", () => {
  const metrics = measureSession([
    prompt("add a button"),
    tool("Edit", "/a.py", 3),
    prompt("[Request interrupted by user]", 4),
    prompt("wrong file", 5),
  ]);
  assert.deepEqual([metrics?.turns, metrics?.interruptions], [2, 1]);
});
