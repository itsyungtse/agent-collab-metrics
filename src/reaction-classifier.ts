import { isHumanPrompt } from "./metrics.ts";
import type { Event } from "./claude-code.ts";

const SYSTEM_ONE_URL = "http://localhost:11434/v1/systemone";
const MODEL_NAME = "nimble";
const MAX_REPLY_CHARACTERS = 1500;
const MAX_PROMPT_CHARACTERS = 1500;
const REQUEST_TIMEOUT_MILLISECONDS = 120_000;
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
  agentReply: string;
  prompt: string;
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
        agentReply: lastAgentReply,
        prompt: event.text,
      });
    }
  }
  return promptsWithReplies;
}

export async function classifyReaction(promptWithReply: PromptWithReply): Promise<ReactionToReply> {
  const state =
    `Agent reply (end): ${promptWithReply.agentReply.slice(-MAX_REPLY_CHARACTERS)}\n\n` +
    `User message: ${promptWithReply.prompt.slice(0, MAX_PROMPT_CHARACTERS)}`;
  const response = await fetch(SYSTEM_ONE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_NAME, state, questions: REACTION_QUESTIONS }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) throw new Error(`System One request failed: ${response.status} ${await response.text()}`);
  const { answers } = (await response.json()) as { answers: { reaction: { choice: string; confidence: number } } };
  return { label: answers.reaction.choice, confidence: answers.reaction.confidence };
}
