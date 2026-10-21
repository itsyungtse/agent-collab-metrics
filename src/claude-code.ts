import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TOOL_TARGET_FIELDS = ["file_path", "path", "notebook_path", "command", "pattern", "url"];

export type EventKind = "user_prompt" | "assistant_text" | "tool_use" | "tool_result";

export interface Event {
  sessionId: string;
  projectDirectory: string;
  gitBranch: string;
  timestamp: Date;
  kind: EventKind;
  isSidechain: boolean;
  toolName: string;
  toolTarget: string;
  toolFailed: boolean;
  text: string;
}

type JsonObject = Record<string, any>;

export function readEvents(sessionFile: string): Event[] {
  const events: Event[] = [];
  for (const line of readFileSync(sessionFile, "utf-8").split("\n")) {
    const record = parseLine(line);
    if (record && (record.type === "user" || record.type === "assistant")) {
      events.push(...eventsFromRecord(record));
    }
  }
  return events;
}

export function readSessions(projectsDirectory: string): Event[][] {
  return listSessionFiles(projectsDirectory).map(readEvents);
}

function listSessionFiles(projectsDirectory: string): string[] {
  const sessionFiles: string[] = [];
  for (const projectName of readdirSync(projectsDirectory)) {
    const projectPath = join(projectsDirectory, projectName);
    if (!statSync(projectPath).isDirectory()) continue;
    for (const fileName of readdirSync(projectPath)) {
      if (fileName.endsWith(".jsonl")) sessionFiles.push(join(projectPath, fileName));
    }
  }
  return sessionFiles.sort();
}

function parseLine(line: string): JsonObject | null {
  try {
    const record = JSON.parse(line);
    return record !== null && typeof record === "object" && !Array.isArray(record) ? record : null;
  } catch {
    return null;
  }
}

function eventsFromRecord(record: JsonObject): Event[] {
  if (record.isMeta) return [];
  const content = record.message?.content;
  const blocks: JsonObject[] = typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);
  return blocks.flatMap((block) => eventFromBlock(record, block) ?? []);
}

function eventFromBlock(record: JsonObject, block: JsonObject): Event | null {
  const role = record.type;
  const common = {
    sessionId: record.sessionId ?? "",
    projectDirectory: record.cwd ?? "",
    gitBranch: record.gitBranch ?? "",
    timestamp: new Date(record.timestamp),
    isSidechain: Boolean(record.isSidechain),
    toolName: "",
    toolTarget: "",
    toolFailed: false,
    text: "",
  };
  if (role === "user" && block.type === "text") {
    return { ...common, kind: "user_prompt", text: block.text };
  }
  if (role === "user" && block.type === "tool_result") {
    return { ...common, kind: "tool_result", toolFailed: Boolean(block.is_error) };
  }
  if (role === "assistant" && block.type === "text") {
    return { ...common, kind: "assistant_text", text: block.text };
  }
  if (role === "assistant" && block.type === "tool_use") {
    return { ...common, kind: "tool_use", toolName: block.name, toolTarget: toolTarget(block.input ?? {}) };
  }
  return null;
}

function toolTarget(toolInput: JsonObject): string {
  for (const field of TOOL_TARGET_FIELDS) {
    if (typeof toolInput[field] === "string") return toolInput[field];
  }
  return "";
}
