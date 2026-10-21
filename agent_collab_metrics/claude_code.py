import json
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

TOOL_TARGET_FIELDS = ("file_path", "path", "notebook_path", "command", "pattern", "url")


@dataclass(frozen=True)
class Event:
    session_id: str
    project_directory: str
    git_branch: str
    timestamp: datetime
    kind: str
    is_sidechain: bool
    tool_name: str = ""
    tool_target: str = ""
    tool_failed: bool = False
    text: str = ""


def read_events(session_file: Path) -> Iterator[Event]:
    with session_file.open(encoding="utf-8") as lines:
        for line in lines:
            record = _parse_line(line)
            if record is not None and record.get("type") in ("user", "assistant"):
                yield from _events_from_record(record)


def read_sessions(projects_directory: Path) -> Iterator[list[Event]]:
    for session_file in sorted(projects_directory.glob("*/*.jsonl")):
        yield list(read_events(session_file))


def read_all_events(projects_directory: Path) -> Iterator[Event]:
    for session_events in read_sessions(projects_directory):
        yield from session_events


def _parse_line(line: str) -> dict | None:
    try:
        record = json.loads(line)
    except json.JSONDecodeError:
        return None
    return record if isinstance(record, dict) else None


def _events_from_record(record: dict) -> Iterator[Event]:
    if record.get("isMeta"):
        return
    content = record.get("message", {}).get("content")
    blocks = [{"type": "text", "text": content}] if isinstance(content, str) else content or []
    for block in blocks:
        event = _event_from_block(record, block)
        if event is not None:
            yield event


def _event_from_block(record: dict, block: dict) -> Event | None:
    role = record["type"]
    block_type = block.get("type")
    common = dict(
        session_id=record.get("sessionId", ""),
        project_directory=record.get("cwd", ""),
        git_branch=record.get("gitBranch", ""),
        timestamp=datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00")),
        is_sidechain=bool(record.get("isSidechain")),
    )
    if role == "user" and block_type == "text":
        return Event(kind="user_prompt", text=block["text"], **common)
    if role == "user" and block_type == "tool_result":
        return Event(kind="tool_result", tool_failed=bool(block.get("is_error")), **common)
    if role == "assistant" and block_type == "text":
        return Event(kind="assistant_text", text=block["text"], **common)
    if role == "assistant" and block_type == "tool_use":
        return Event(
            kind="tool_use",
            tool_name=block["name"],
            tool_target=_tool_target(block.get("input", {})),
            **common,
        )
    return None


def _tool_target(tool_input: dict) -> str:
    for field in TOOL_TARGET_FIELDS:
        if isinstance(tool_input.get(field), str):
            return tool_input[field]
    return ""
