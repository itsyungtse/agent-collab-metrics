import { homedir } from "node:os";
import { join } from "node:path";
import { readSessions } from "./claude-code.ts";
import { median } from "./median.ts";
import { measureSession, type SessionMetrics } from "./metrics.ts";

const DEFAULT_PROJECTS_DIRECTORY = join(homedir(), ".claude", "projects");

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function summarizeProject(projectDirectory: string, sessions: SessionMetrics[]): string {
  const turns = sum(sessions.map((session) => session.turns));
  const corrections = sum(sessions.map((session) => session.corrections));
  const interruptions = sum(sessions.map((session) => session.interruptions));
  const explorations = sessions.flatMap((session) => session.exploration ?? []);
  const medianToolCalls = explorations.length ? median(explorations.map((e) => e.toolCalls)) : "-";
  const medianFilesRead = explorations.length ? median(explorations.map((e) => e.filesRead)) : "-";
  const correctionRate = Math.round((corrections / Math.max(turns - sessions.length, 1)) * 100);
  return (
    `${projectDirectory}\n` +
    `  sessions=${sessions.length} turns=${turns} median_turns=${median(sessions.map((s) => s.turns))}` +
    ` corrections=${corrections} (${correctionRate}%) interruptions=${interruptions}\n` +
    `  before first edit (median over ${explorations.length} sessions with edits):` +
    ` tool_calls=${medianToolCalls} files_read=${medianFilesRead}`
  );
}

const sessionsByProject = new Map<string, SessionMetrics[]>();
for (const sessionEvents of readSessions(process.argv[2] ?? DEFAULT_PROJECTS_DIRECTORY)) {
  const session = measureSession(sessionEvents);
  if (session && session.turns) {
    sessionsByProject.set(session.projectDirectory, [...(sessionsByProject.get(session.projectDirectory) ?? []), session]);
  }
}
const projectsByTurns = [...sessionsByProject].sort(
  ([, left], [, right]) => sum(right.map((s) => s.turns)) - sum(left.map((s) => s.turns)),
);
for (const [projectDirectory, sessions] of projectsByTurns) {
  console.log(summarizeProject(projectDirectory, sessions));
}
