import unittest
from datetime import datetime, timedelta, timezone

from agent_collab_metrics.claude_code import Event
from agent_collab_metrics.metrics import (
    count_corrections,
    is_human_prompt,
    measure_exploration_before_first_edit,
    measure_session,
)

START = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)


def event(kind: str, seconds: int = 0, **fields) -> Event:
    defaults = dict(
        session_id="session-1",
        project_directory="/work/project",
        git_branch="main",
        timestamp=START + timedelta(seconds=seconds),
        is_sidechain=False,
    )
    return Event(kind=kind, **{**defaults, **fields})


def prompt(text: str, seconds: int = 0, **fields) -> Event:
    return event("user_prompt", seconds, text=text, **fields)


def tool(name: str, target: str = "", seconds: int = 0, **fields) -> Event:
    return event("tool_use", seconds, tool_name=name, tool_target=target, **fields)


class HumanPromptTest(unittest.TestCase):
    def test_system_injected_text_is_not_a_human_prompt(self):
        self.assertFalse(is_human_prompt(prompt("<task-notification>done</task-notification>")))
        self.assertFalse(is_human_prompt(prompt("<ide_opened_file>a.py</ide_opened_file>")))
        self.assertFalse(is_human_prompt(prompt("[Request interrupted by user]")))

    def test_ide_context_followed_by_text_is_a_human_prompt(self):
        self.assertTrue(is_human_prompt(prompt("<ide_selection>x</ide_selection>\nwhat is this")))

    def test_subagent_prompt_is_not_a_human_prompt(self):
        self.assertFalse(is_human_prompt(prompt("do the task", is_sidechain=True)))


class CorrectionTest(unittest.TestCase):
    def test_counts_only_prompts_after_the_agent_replied(self):
        session_events = [
            prompt("不要用 mock"),
            event("assistant_text", 1, text="ok"),
            prompt("不是，我說的是前端", 2),
            prompt("looks good", 3),
        ]
        self.assertEqual(count_corrections(session_events), 1)


class ExplorationTest(unittest.TestCase):
    def test_counts_tool_calls_and_distinct_files_before_first_edit(self):
        session_events = [
            prompt("fix it"),
            tool("Read", "/a.py", 5),
            tool("Read", "/a.py", 6),
            tool("Bash", "ls", 7),
            tool("Edit", "/a.py", 20),
            tool("Read", "/b.py", 30),
        ]
        exploration = measure_exploration_before_first_edit(session_events)
        self.assertEqual((exploration.tool_calls, exploration.files_read, exploration.seconds), (3, 1, 20))

    def test_none_when_session_never_edits(self):
        self.assertIsNone(measure_exploration_before_first_edit([prompt("explain"), tool("Read", "/a.py", 1)]))


class SessionTest(unittest.TestCase):
    def test_measures_turns_corrections_and_interruptions(self):
        session_events = [
            prompt("add a button"),
            tool("Edit", "/a.py", 3),
            prompt("[Request interrupted by user]", 4),
            prompt("wrong file", 5),
        ]
        metrics = measure_session(session_events)
        self.assertEqual((metrics.turns, metrics.corrections, metrics.interruptions), (2, 1, 1))


if __name__ == "__main__":
    unittest.main()
