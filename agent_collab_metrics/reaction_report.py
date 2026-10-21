import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_REACTIONS_FILE = Path("data") / "reactions.jsonl"
MIN_RECORDS_PER_PROJECT = 20
CONFIDENT_THRESHOLD = 0.8


def read_reactions(reactions_file: Path) -> list[dict]:
    with reactions_file.open(encoding="utf-8") as lines:
        return [json.loads(line) for line in lines]


def print_label_rates_by_project(reactions: list[dict]) -> None:
    labels_by_project: dict[str, Counter] = defaultdict(Counter)
    for reaction in reactions:
        labels_by_project[reaction["project_directory"]][reaction["label"]] += 1
    print("label rates by project (projects with enough prompts)")
    for project_directory, labels in sorted(labels_by_project.items(), key=lambda item: -sum(item[1].values())):
        total = sum(labels.values())
        if total >= MIN_RECORDS_PER_PROJECT:
            rates = " ".join(f"{label}={labels[label] / total:.0%}" for label in ("correction", "confusion", "accept", "new_request"))
            print(f"  {project_directory} n={total} {rates}")


def describe_replies(label: str, reactions: list[dict]) -> str:
    if not reactions:
        return f"  {label}: no records"
    return (
        f"  {label} n={len(reactions)}"
        f" median_characters={statistics.median(r['reply_characters'] for r in reactions):.0f}"
        f" with_code_block={sum(r['reply_has_code_block'] for r in reactions) / len(reactions):.0%}"
        f" median_english_terms={statistics.median(r['reply_english_terms'] for r in reactions):.0f}"
    )


def print_reply_traits(reactions: list[dict]) -> None:
    confident = [r for r in reactions if r["confidence"] >= CONFIDENT_THRESHOLD]
    print(f"\nreply traits (only reactions with confidence >= {CONFIDENT_THRESHOLD}, {len(confident)} of {len(reactions)})")
    for label in ("confusion", "correction", "accept", "new_request"):
        print(describe_replies(label, [r for r in confident if r["label"] == label]))


def main() -> None:
    reactions = read_reactions(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REACTIONS_FILE)
    overall = Counter(reaction["label"] for reaction in reactions)
    print(f"{len(reactions)} reactions: {dict(overall)}\n")
    print_label_rates_by_project(reactions)
    print_reply_traits(reactions)


if __name__ == "__main__":
    main()
