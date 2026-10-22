import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactionRecord } from "../src/reaction-classifier.ts";
import { startOfWeek, weeklyTrend } from "../src/weekly-trend.ts";

function record(promptTime: Date, label: string): ReactionRecord {
  return {
    projectDirectory: "/work",
    sessionId: "session-1",
    promptTime: promptTime.toISOString(),
    label,
    confidence: 0.9,
    replyCharacters: 4,
    replyHasCodeBlock: false,
    replyEnglishTerms: 1,
  };
}

const WEDNESDAY_OCT_21 = new Date(2026, 9, 21, 10);
const THURSDAY_OCT_22 = new Date(2026, 9, 22, 23);
const THURSDAY_NOV_5 = new Date(2026, 10, 5, 9);

test("a week starts on Monday at local midnight", () => {
  assert.deepEqual(startOfWeek(WEDNESDAY_OCT_21), new Date(2026, 9, 19));
  assert.deepEqual(startOfWeek(new Date(2026, 9, 25, 23)), new Date(2026, 9, 19));
  assert.deepEqual(startOfWeek(new Date(2026, 9, 26)), new Date(2026, 9, 26));
});

test("records are counted per week, keeping empty weeks in between", () => {
  const records = [
    record(WEDNESDAY_OCT_21, "correction"),
    record(THURSDAY_OCT_22, "confusion"),
    record(THURSDAY_OCT_22, "accept"),
    record(THURSDAY_NOV_5, "correction"),
  ];
  assert.deepEqual(
    weeklyTrend(records, []).map(({ weekStart, reactions, corrections, confusions }) => [
      weekStart.getDate(),
      reactions,
      corrections,
      confusions,
    ]),
    [
      [19, 3, 1, 1],
      [26, 0, 0, 0],
      [2, 1, 1, 0],
    ],
  );
});

test("a rules update after the last record still gets its own week", () => {
  const weeks = weeklyTrend([record(WEDNESDAY_OCT_21, "accept")], [THURSDAY_OCT_22, THURSDAY_NOV_5]);
  assert.deepEqual(
    weeks.map((week) => week.rulesUpdates),
    [1, 0, 1],
  );
});

test("no records means no weeks", () => {
  assert.deepEqual(weeklyTrend([], [THURSDAY_OCT_22]), []);
});
