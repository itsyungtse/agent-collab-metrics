import statistics
import sys
from collections import defaultdict
from pathlib import Path

from agent_collab_metrics.claude_code import read_sessions
from agent_collab_metrics.metrics import SessionMetrics, measure_session

DEFAULT_PROJECTS_DIRECTORY = Path.home() / ".claude" / "projects"


def summarize_project(project_directory: str, sessions: list[SessionMetrics]) -> str:
    turns = sum(session.turns for session in sessions)
    corrections = sum(session.corrections for session in sessions)
    interruptions = sum(session.interruptions for session in sessions)
    explorations = [session.exploration for session in sessions if session.exploration]
    median_tool_calls = statistics.median(e.tool_calls for e in explorations) if explorations else "-"
    median_files_read = statistics.median(e.files_read for e in explorations) if explorations else "-"
    correction_rate = f"{corrections / max(turns - len(sessions), 1):.0%}"
    return (
        f"{project_directory}\n"
        f"  sessions={len(sessions)} turns={turns} median_turns={statistics.median(s.turns for s in sessions)}"
        f" corrections={corrections} ({correction_rate}) interruptions={interruptions}\n"
        f"  before first edit (median over {len(explorations)} sessions with edits):"
        f" tool_calls={median_tool_calls} files_read={median_files_read}"
    )


def main() -> None:
    projects_directory = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PROJECTS_DIRECTORY
    sessions_by_project: dict[str, list[SessionMetrics]] = defaultdict(list)
    for session_events in read_sessions(projects_directory):
        session = measure_session(session_events)
        if session and session.turns:
            sessions_by_project[session.project_directory].append(session)
    ranked = sorted(sessions_by_project.items(), key=lambda item: -sum(s.turns for s in item[1]))
    for project_directory, sessions in ranked:
        print(summarize_project(project_directory, sessions))


if __name__ == "__main__":
    main()
