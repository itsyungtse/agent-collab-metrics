import json
import tempfile
import unittest
from pathlib import Path

from agent_collab_metrics.claude_code import read_events


def session_line(record_type: str, content, **overrides) -> str:
    record = {
        "type": record_type,
        "timestamp": "2026-10-21T10:00:00.000Z",
        "sessionId": "session-1",
        "cwd": "/work/project",
        "gitBranch": "main",
        "message": {"role": record_type, "content": content},
        **overrides,
    }
    return json.dumps(record)


class ReadEventsTest(unittest.TestCase):
    def read(self, *lines: str) -> list:
        with tempfile.TemporaryDirectory() as directory:
            session_file = Path(directory) / "session.jsonl"
            session_file.write_text("\n".join(lines), encoding="utf-8")
            return list(read_events(session_file))

    def test_string_content_is_a_user_prompt(self):
        [event] = self.read(session_line("user", "fix the bug"))
        self.assertEqual((event.kind, event.text, event.session_id), ("user_prompt", "fix the bug", "session-1"))

    def test_tool_use_keeps_name_and_target(self):
        tool_use = {"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "/work/a.py"}}
        [event] = self.read(session_line("assistant", [tool_use]))
        self.assertEqual((event.kind, event.tool_name, event.tool_target), ("tool_use", "Read", "/work/a.py"))

    def test_tool_result_marks_failure(self):
        tool_result = {"type": "tool_result", "tool_use_id": "t1", "content": "boom", "is_error": True}
        [event] = self.read(session_line("user", [tool_result]))
        self.assertEqual((event.kind, event.tool_failed), ("tool_result", True))

    def test_thinking_meta_and_bookkeeping_records_are_skipped(self):
        thinking = {"type": "thinking", "thinking": "hmm", "signature": "x"}
        events = self.read(
            session_line("assistant", [thinking]),
            session_line("user", "hidden", isMeta=True),
            json.dumps({"type": "last-prompt", "lastPrompt": "x"}),
            "not json",
        )
        self.assertEqual(events, [])

    def test_sidechain_flag_is_kept(self):
        [event] = self.read(session_line("user", "subagent task", isSidechain=True))
        self.assertTrue(event.is_sidechain)


if __name__ == "__main__":
    unittest.main()
