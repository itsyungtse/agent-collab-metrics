import re
from dataclasses import dataclass
from datetime import datetime

from agent_collab_metrics.claude_code import Event

EDIT_TOOL_NAMES = ("Edit", "Write", "NotebookEdit")
INTERRUPT_PREFIX = "[Request interrupted by user"
SYSTEM_INJECTED_PREFIXES = ("<task-notification>", "<local-command-stdout>", "<local-command-caveat>")
IDE_CONTEXT_PATTERN = re.compile(
    r"<(ide_opened_file|ide_selection|system-reminder)>.*?</\1>", re.DOTALL
)
CORRECTION_PATTERN = re.compile(
    r"^(no|nope)\b|wrong|don't|do not|revert|undo|not what i|不是|不對|不要|錯了|我說的|重做|重新|改回|還原",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ExplorationBeforeFirstEdit:
    tool_calls: int
    files_read: int
    seconds: float


@dataclass(frozen=True)
class SessionMetrics:
    session_id: str
    project_directory: str
    turns: int
    corrections: int
    interruptions: int
    exploration: ExplorationBeforeFirstEdit | None


def is_interruption(event: Event) -> bool:
    return event.kind == "user_prompt" and event.text.startswith(INTERRUPT_PREFIX)


def is_human_prompt(event: Event) -> bool:
    if event.kind != "user_prompt" or event.is_sidechain or is_interruption(event):
        return False
    if event.text.startswith(SYSTEM_INJECTED_PREFIXES):
        return False
    return bool(IDE_CONTEXT_PATTERN.sub("", event.text).strip())


def is_correction(prompt: Event) -> bool:
    return bool(CORRECTION_PATTERN.search(IDE_CONTEXT_PATTERN.sub("", prompt.text).strip()))


def count_corrections(session_events: list[Event]) -> int:
    corrections = 0
    agent_has_replied = False
    for event in session_events:
        if event.is_sidechain:
            continue
        if event.kind in ("assistant_text", "tool_use"):
            agent_has_replied = True
        elif agent_has_replied and is_human_prompt(event) and is_correction(event):
            corrections += 1
    return corrections


def measure_exploration_before_first_edit(session_events: list[Event]) -> ExplorationBeforeFirstEdit | None:
    main_events = [event for event in session_events if not event.is_sidechain]
    first_prompt_time = next((event.timestamp for event in main_events if is_human_prompt(event)), None)
    tool_calls = 0
    files_read: set[str] = set()
    for event in main_events:
        if event.kind != "tool_use":
            continue
        if event.tool_name in EDIT_TOOL_NAMES:
            if first_prompt_time is None:
                return None
            return ExplorationBeforeFirstEdit(
                tool_calls=tool_calls,
                files_read=len(files_read),
                seconds=_seconds_between(first_prompt_time, event.timestamp),
            )
        tool_calls += 1
        if event.tool_name == "Read":
            files_read.add(event.tool_target)
    return None


def measure_session(session_events: list[Event]) -> SessionMetrics | None:
    if not session_events:
        return None
    main_events = [event for event in session_events if not event.is_sidechain]
    return SessionMetrics(
        session_id=session_events[0].session_id,
        project_directory=session_events[0].project_directory,
        turns=sum(is_human_prompt(event) for event in main_events),
        corrections=count_corrections(session_events),
        interruptions=sum(is_interruption(event) for event in main_events),
        exploration=measure_exploration_before_first_edit(session_events),
    )


def _seconds_between(start: datetime, end: datetime) -> float:
    return max((end - start).total_seconds(), 0.0)
