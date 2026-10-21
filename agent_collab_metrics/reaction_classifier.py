import json
import urllib.request
from dataclasses import dataclass

from agent_collab_metrics.claude_code import Event
from agent_collab_metrics.metrics import is_human_prompt

SYSTEM_ONE_URL = "http://localhost:11434/v1/systemone"
MODEL_NAME = "nimble"
MAX_REPLY_CHARACTERS = 1500
MAX_PROMPT_CHARACTERS = 1500
REACTION_QUESTION = {
    "reaction": {
        "type": "choice",
        "instructions": "How does the user message react to the agent reply?",
        "criteria": {
            "correction": "The user says the agent did the wrong thing, or asks to redo or undo it",
            "confusion": "The user does not understand the agent reply and asks for an explanation",
            "accept": "The user approves the result or tells the agent to continue",
            "new_request": "The user asks for something new, unrelated to fixing the previous reply",
        },
    }
}


@dataclass(frozen=True)
class ReactionToReply:
    label: str
    confidence: float


@dataclass(frozen=True)
class PromptWithReply:
    project_directory: str
    agent_reply: str
    prompt: str


def collect_prompts_after_replies(session_events: list[Event]) -> list[PromptWithReply]:
    prompts_with_replies = []
    last_agent_reply = ""
    for event in session_events:
        if event.is_sidechain:
            continue
        if event.kind == "assistant_text":
            last_agent_reply = event.text
        elif is_human_prompt(event) and last_agent_reply:
            prompts_with_replies.append(PromptWithReply(event.project_directory, last_agent_reply, event.text))
    return prompts_with_replies


def classify_reaction(prompt_with_reply: PromptWithReply) -> ReactionToReply:
    state = (
        f"Agent reply (end): {prompt_with_reply.agent_reply[-MAX_REPLY_CHARACTERS:]}\n\n"
        f"User message: {prompt_with_reply.prompt[:MAX_PROMPT_CHARACTERS]}"
    )
    body = json.dumps({"model": MODEL_NAME, "state": state, "questions": REACTION_QUESTION}).encode()
    request = urllib.request.Request(SYSTEM_ONE_URL, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        answer = json.load(response)["answers"]["reaction"]
    return ReactionToReply(label=answer["choice"], confidence=answer["confidence"])
