import json
import re
import sys
import time
from pathlib import Path

from agent_collab_metrics.claude_code import read_sessions
from agent_collab_metrics.reaction_classifier import (
    PromptWithReply,
    classify_reaction,
    collect_prompts_after_replies,
)

DEFAULT_PROJECTS_DIRECTORY = Path.home() / ".claude" / "projects"
DEFAULT_OUTPUT_FILE = Path("data") / "reactions.jsonl"
CODE_BLOCK_PATTERN = re.compile(r"```.*?```", re.DOTALL)
ENGLISH_TERM_PATTERN = re.compile(r"[A-Za-z][A-Za-z_]{2,}")


def describe_reply(agent_reply: str) -> dict:
    prose = CODE_BLOCK_PATTERN.sub("", agent_reply)
    return {
        "reply_characters": len(agent_reply),
        "reply_has_code_block": "```" in agent_reply,
        "reply_english_terms": len(ENGLISH_TERM_PATTERN.findall(prose)),
    }


def reaction_record(prompt_with_reply: PromptWithReply) -> dict:
    reaction = classify_reaction(prompt_with_reply)
    return {
        "project_directory": prompt_with_reply.project_directory,
        "label": reaction.label,
        "confidence": reaction.confidence,
        **describe_reply(prompt_with_reply.agent_reply),
    }


def main() -> None:
    output_file = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT_FILE
    output_file.parent.mkdir(parents=True, exist_ok=True)
    all_prompts = [
        prompt_with_reply
        for session_events in read_sessions(DEFAULT_PROJECTS_DIRECTORY)
        for prompt_with_reply in collect_prompts_after_replies(session_events)
    ]
    started_at = time.perf_counter()
    with output_file.open("w", encoding="utf-8") as records:
        for position, prompt_with_reply in enumerate(all_prompts, start=1):
            records.write(json.dumps(reaction_record(prompt_with_reply), ensure_ascii=False) + "\n")
            if position % 100 == 0:
                print(f"{position}/{len(all_prompts)} {time.perf_counter() - started_at:.0f}s", flush=True)
    print(f"done: {len(all_prompts)} records in {output_file}")


if __name__ == "__main__":
    main()
