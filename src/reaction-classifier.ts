import { isHumanPrompt } from "./metrics.ts";
import type { Event } from "./claude-code.ts";

export const OLLAMA_URL = "http://localhost:11434";
const SYSTEM_ONE_URL = `${OLLAMA_URL}/v1/systemone`;
const MAX_REPLY_CHARACTERS = 1500;
const MAX_PROMPT_CHARACTERS = 1500;
const REQUEST_TIMEOUT_MILLISECONDS = 120_000;
const CODE_BLOCK_PATTERN = /```.*?```/gs;
const ENGLISH_TERM_PATTERN = /[A-Za-z][A-Za-z_]{2,}/g;
const REACTION_QUESTIONS = {
  reaction: {
    type: "choice",
    instructions: "How does the user message react to the agent reply?",
    criteria: {
      correction: "The user says the agent did the wrong thing, or asks to redo or undo it",
      confusion: "The user does not understand the agent reply and asks for an explanation",
      accept: "The user approves the result or tells the agent to continue",
      new_request: "The user asks for something new, unrelated to fixing the previous reply",
    },
  },
};

export interface ReactionToReply {
  label: string;
  confidence: number;
}

export interface PromptWithReply {
  projectDirectory: string;
  sessionId: string;
  promptTime: Date;
  agentReply: string;
  prompt: string;
}

export interface ReactionRecord {
  projectDirectory: string;
  sessionId: string;
  promptTime: string;
  label: string;
  confidence: number;
  replyCharacters: number;
  replyHasCodeBlock: boolean;
  replyEnglishTerms: number;
}

export function collectPromptsAfterReplies(sessionEvents: Event[]): PromptWithReply[] {
  const promptsWithReplies: PromptWithReply[] = [];
  let lastAgentReply = "";
  for (const event of sessionEvents) {
    if (event.isSidechain) continue;
    if (event.kind === "assistant_text") {
      lastAgentReply = event.text;
    } else if (isHumanPrompt(event) && lastAgentReply) {
      promptsWithReplies.push({
        projectDirectory: event.projectDirectory,
        sessionId: event.sessionId,
        promptTime: event.timestamp,
        agentReply: lastAgentReply,
        prompt: event.text,
      });
    }
  }
  return promptsWithReplies;
}

export function promptKey(sessionId: string, promptTime: string): string {
  return `${sessionId} ${promptTime}`;
}

export function unclassifiedPrompts(promptsWithReplies: PromptWithReply[], records: ReactionRecord[]): PromptWithReply[] {
  const classifiedKeys = new Set(records.map((record) => promptKey(record.sessionId, record.promptTime)));
  return promptsWithReplies.filter(
    (promptWithReply) =>
      !classifiedKeys.has(promptKey(promptWithReply.sessionId, promptWithReply.promptTime.toISOString())),
  );
}

export function recordsAfter(records: ReactionRecord[], since: Date | null): ReactionRecord[] {
  return since ? records.filter((record) => new Date(record.promptTime) > since) : records;
}

export async function classifyReaction(promptWithReply: PromptWithReply, modelName: string): Promise<ReactionToReply> {
  const state =
    `Agent reply (end): ${promptWithReply.agentReply.slice(-MAX_REPLY_CHARACTERS)}\n\n` +
    `User message: ${promptWithReply.prompt.slice(0, MAX_PROMPT_CHARACTERS)}`;
  const response = await fetch(SYSTEM_ONE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, state, questions: REACTION_QUESTIONS }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) throw new Error(`System One request failed: ${response.status} ${await response.text()}`);
  const { answers } = (await response.json()) as { answers: { reaction: { choice: string; confidence: number } } };
  return { label: answers.reaction.choice, confidence: answers.reaction.confidence };
}

function describeReply(agentReply: string) {
  const prose = agentReply.replace(CODE_BLOCK_PATTERN, "");
  return {
    replyCharacters: agentReply.length,
    replyHasCodeBlock: agentReply.includes("```"),
    replyEnglishTerms: (prose.match(ENGLISH_TERM_PATTERN) ?? []).length,
  };
}

export async function reactionRecord(promptWithReply: PromptWithReply, modelName: string): Promise<ReactionRecord> {
  const reaction = await classifyReaction(promptWithReply, modelName);
  return {
    projectDirectory: promptWithReply.projectDirectory,
    sessionId: promptWithReply.sessionId,
    promptTime: promptWithReply.promptTime.toISOString(),
    label: reaction.label,
    confidence: reaction.confidence,
    ...describeReply(promptWithReply.agentReply),
  };
}
