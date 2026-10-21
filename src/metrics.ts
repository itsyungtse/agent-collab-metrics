import type { Event } from "./claude-code.ts";

const EDIT_TOOL_NAMES = ["Edit", "Write", "NotebookEdit"];
const INTERRUPT_PREFIX = "[Request interrupted by user";
const SYSTEM_INJECTED_PREFIXES = ["<task-notification>", "<local-command-stdout>", "<local-command-caveat>"];
const IDE_CONTEXT_PATTERN = /<(ide_opened_file|ide_selection|system-reminder)>.*?<\/\1>/gs;
const CORRECTION_PATTERN =
  /^(no|nope)\b|wrong|don't|do not|revert|undo|not what i|不是|不對|不要|錯了|我說的|重做|重新|改回|還原/i;

export interface ExplorationBeforeFirstEdit {
  toolCalls: number;
  filesRead: number;
  seconds: number;
}

export interface SessionMetrics {
  sessionId: string;
  projectDirectory: string;
  turns: number;
  corrections: number;
  interruptions: number;
  exploration: ExplorationBeforeFirstEdit | null;
}

export function isInterruption(event: Event): boolean {
  return event.kind === "user_prompt" && event.text.startsWith(INTERRUPT_PREFIX);
}

export function isHumanPrompt(event: Event): boolean {
  if (event.kind !== "user_prompt" || event.isSidechain || isInterruption(event)) return false;
  if (SYSTEM_INJECTED_PREFIXES.some((prefix) => event.text.startsWith(prefix))) return false;
  return withoutIdeContext(event.text) !== "";
}

export function isCorrection(prompt: Event): boolean {
  return CORRECTION_PATTERN.test(withoutIdeContext(prompt.text));
}

export function countCorrections(sessionEvents: Event[]): number {
  let corrections = 0;
  let agentHasReplied = false;
  for (const event of sessionEvents) {
    if (event.isSidechain) continue;
    if (event.kind === "assistant_text" || event.kind === "tool_use") {
      agentHasReplied = true;
    } else if (agentHasReplied && isHumanPrompt(event) && isCorrection(event)) {
      corrections += 1;
    }
  }
  return corrections;
}

export function measureExplorationBeforeFirstEdit(sessionEvents: Event[]): ExplorationBeforeFirstEdit | null {
  const mainEvents = sessionEvents.filter((event) => !event.isSidechain);
  const firstPromptTime = mainEvents.find(isHumanPrompt)?.timestamp;
  let toolCalls = 0;
  const filesRead = new Set<string>();
  for (const event of mainEvents) {
    if (event.kind !== "tool_use") continue;
    if (EDIT_TOOL_NAMES.includes(event.toolName)) {
      if (!firstPromptTime) return null;
      return {
        toolCalls,
        filesRead: filesRead.size,
        seconds: secondsBetween(firstPromptTime, event.timestamp),
      };
    }
    toolCalls += 1;
    if (event.toolName === "Read") filesRead.add(event.toolTarget);
  }
  return null;
}

export function measureSession(sessionEvents: Event[]): SessionMetrics | null {
  if (sessionEvents.length === 0) return null;
  const mainEvents = sessionEvents.filter((event) => !event.isSidechain);
  return {
    sessionId: sessionEvents[0].sessionId,
    projectDirectory: sessionEvents[0].projectDirectory,
    turns: mainEvents.filter(isHumanPrompt).length,
    corrections: countCorrections(sessionEvents),
    interruptions: mainEvents.filter(isInterruption).length,
    exploration: measureExplorationBeforeFirstEdit(sessionEvents),
  };
}

function withoutIdeContext(text: string): string {
  return text.replace(IDE_CONTEXT_PATTERN, "").trim();
}

function secondsBetween(start: Date, end: Date): number {
  return Math.max((end.getTime() - start.getTime()) / 1000, 0);
}
