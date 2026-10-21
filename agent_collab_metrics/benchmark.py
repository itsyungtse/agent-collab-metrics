import random
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

from agent_collab_metrics.claude_code import read_sessions
from agent_collab_metrics.reaction_classifier import (
    PromptWithReply,
    classify_reaction,
    collect_prompts_after_replies,
)

DEFAULT_PROJECTS_DIRECTORY = Path.home() / ".claude" / "projects"
DEFAULT_SAMPLE_SIZE = 200
RANDOM_SEED = 0


def main() -> None:
    sample_size = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SAMPLE_SIZE
    all_prompts: list[PromptWithReply] = []
    for session_events in read_sessions(DEFAULT_PROJECTS_DIRECTORY):
        all_prompts.extend(collect_prompts_after_replies(session_events))
    sample = random.Random(RANDOM_SEED).sample(all_prompts, min(sample_size, len(all_prompts)))

    seconds_per_call = []
    labels: Counter[str] = Counter()
    started_at = time.perf_counter()
    for prompt_with_reply in sample:
        call_started_at = time.perf_counter()
        labels[classify_reaction(prompt_with_reply).label] += 1
        seconds_per_call.append(time.perf_counter() - call_started_at)
    total_seconds = time.perf_counter() - started_at

    print(f"classified {len(sample)} of {len(all_prompts)} prompts in {total_seconds:.1f}s")
    print(f"per call: median={statistics.median(seconds_per_call):.2f}s max={max(seconds_per_call):.2f}s")
    print(f"estimated for all {len(all_prompts)} prompts: {total_seconds / len(sample) * len(all_prompts) / 60:.1f} min")
    print(f"labels: {dict(labels)}")


if __name__ == "__main__":
    main()
