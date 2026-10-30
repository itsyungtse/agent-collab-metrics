import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ReactionRecord } from "./reaction-classifier.ts";

export const PROJECTS_DIRECTORY = join(homedir(), ".claude", "projects");
export const CLAUDE_SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
export const CLAUDE_INSTRUCTIONS_FILE = join(homedir(), ".claude", "CLAUDE.md");
const DATA_DIRECTORY = join(homedir(), ".agent-collab-metrics");
export const REACTIONS_FILE = join(DATA_DIRECTORY, "reactions.jsonl");
const CONFIG_FILE = join(DATA_DIRECTORY, "config.json");
const STATE_FILE = join(DATA_DIRECTORY, "state.json");
const DEFAULT_RULES_REMINDER_INTERVAL = 500;

export function readJsonFile(file: string): Record<string, any> {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : {};
}

export function writeJsonFile(file: string, value: object): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function readModelName(): string {
  const { model } = readJsonFile(CONFIG_FILE);
  if (!model) throw new Error(`No decision model in ${CONFIG_FILE}. Run setup.ts --model <name> first.`);
  return model;
}

export function saveModelName(modelName: string): void {
  writeJsonFile(CONFIG_FILE, { ...readJsonFile(CONFIG_FILE), model: modelName });
}

export function readRulesReminderInterval(): number {
  const { rulesReminderInterval } = readJsonFile(CONFIG_FILE);
  return rulesReminderInterval ?? DEFAULT_RULES_REMINDER_INTERVAL;
}

export function saveRulesReminderInterval(interval: number): void {
  writeJsonFile(CONFIG_FILE, { ...readJsonFile(CONFIG_FILE), rulesReminderInterval: interval });
}

export function readRulesAppliedAt(): Date | null {
  const { rulesAppliedAt } = readJsonFile(STATE_FILE);
  return rulesAppliedAt ? new Date(rulesAppliedAt) : null;
}

export function readRulesAppliedHistory(): Date[] {
  const { rulesAppliedAt, rulesAppliedHistory } = readJsonFile(STATE_FILE);
  // state.json from older versions only has the latest rulesAppliedAt.
  const appliedTimes: string[] = rulesAppliedHistory ?? (rulesAppliedAt ? [rulesAppliedAt] : []);
  return appliedTimes.map((appliedTime) => new Date(appliedTime));
}

export function saveRulesAppliedAt(appliedAt: Date): void {
  writeJsonFile(STATE_FILE, {
    ...readJsonFile(STATE_FILE),
    rulesAppliedAt: appliedAt.toISOString(),
    rulesAppliedHistory: [...readRulesAppliedHistory(), appliedAt].map((appliedTime) => appliedTime.toISOString()),
  });
}

export function readReactionRecords(reactionsFile = REACTIONS_FILE): ReactionRecord[] {
  if (!existsSync(reactionsFile)) return [];
  return readFileSync(reactionsFile, "utf-8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}
