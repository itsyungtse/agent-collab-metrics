# agent-collab-metrics

Measure how efficiently I work with coding agents, using the session logs already on this machine. No proxy needed.

## Goal

Find patterns in my collaboration with agents (Claude Code first, Codex CLI later) and use them to cut back-and-forth: better prompts, better `CLAUDE.md` rules, better task splitting.

## Data sources

| Tool | Location | Format |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | one JSON object per line, linked by `parentUuid` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | one JSON object per line |

Session logs contain private conversation content. They are read locally and never committed to this repo.

## Metrics

Phase 1 (computable from the logs alone):

1. **Turns per task**: user messages from a request until the user stops following up.
2. **Correction rate**: how often the next user message rejects or fixes the previous reply (keyword heuristic first).
3. **Interruption count**: user stops the agent before it finishes.
4. **Exploration before first edit**: files read and time spent before the first file modification.

Phase 2 (secondary):

5. Wait time per reply (timestamp difference between a user message and the agent's final reply).
6. Repeated reads of the same file within one session.

Deliberately skipped until phase 1 shows a pattern: reply length, token usage, question-type classification.

## Classifying reactions with a decision model

Keywords miss most corrections, so each user message is classified by a local Ollama decision model (`nimble`) through the System One endpoint (`POST /v1/systemone`, Ollama 0.35.0+).

- Input: the end of the agent's previous reply and the user's message.
- Output: one of `correction`, `confusion`, `accept`, `new_request`, with probabilities and a confidence score.
- Everything stays local. Results are written to `data/reactions.jsonl` (git-ignored) with the label, confidence and a few reply traits (length, code block, English term count), never the message text.

```sh
npm run benchmark   # classify a 200-prompt sample and time it
npm run classify    # classify every prompt (about 10 minutes)
npm run report      # label rates per project and reply traits per label
npm run summary     # keyword-based turns, corrections, interruptions, exploration per project
```

The labels are not hand-validated yet.

## Plan

1. Parse Claude Code `.jsonl` into a flat table of events (user, assistant, tool use) with timestamps.
2. Compute phase 1 metrics per session and per project.
3. Look at the results, find the task types with the most back-and-forth, and act on them.
4. Add the Codex CLI parser if it is worth it.
