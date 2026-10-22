---
name: agent-collab-metrics
description: Classify how the user reacts to each agent reply (correction, confusion, accept, new request) with a local Ollama decision model, report where collaboration goes wrong, and turn recurring corrections and confusion into rules in ~/.claude/CLAUDE.md. Use when the user wants to set up collaboration metrics, see the collaboration report, check whether the rules reduced problems over time, benchmark the decision model, when the agent-collab-metrics hook says it is time to update rules, or when the user asks to update the rules learned from past conversations.
argument-hint: "[setup | classify | report | trend | benchmark | rules] [flags]"
metadata:
  version: "0.0.2"
---

# Agent collab metrics

Every time the agent finishes a reply, a Stop hook classifies the user's latest messages with a local Ollama decision model. After every 500 classified replies, the hook asks the user to run `/agent-collab-metrics rules` to turn the recurring problems into rules in `~/.claude/CLAUDE.md`.

`<skill-dir>` below is the directory that contains this SKILL.md. Data is kept in `~/.agent-collab-metrics/`. Talk to the user in the language they write in.

## Commands

The first word after `/agent-collab-metrics` picks the command. Pass the remaining words to the script as flags.

| Command | What it does |
|---|---|
| `setup` | Pick the decision model, add the Stop hook, classify past replies |
| `classify [--latest N]` | Classify past replies again from scratch |
| `report [--since-rules] [--confidence 0.6] [--quote-characters 500]` | Label rates per project and the sessions with the most problems |
| `trend` | Weekly `correction` and `confusion` rates, marking the weeks the rules were updated |
| `benchmark [sample size]` | Time the decision model on a sample of past replies (200 by default) |
| `rules` | Draft rules from the problem sessions and write them into `~/.claude/CLAUDE.md` after the user confirms |

With no command, run `setup` if `~/.agent-collab-metrics/config.json` does not exist; otherwise show this table. Every command except `setup` needs that file, so run `setup` first when it is missing.

## setup

Also run this when the user wants to change the decision model.

1. Run `node --version`. Node 22.18 or newer is required, because the scripts are run as `.ts` files directly. If it is older, ask the user to upgrade Node and stop.
2. Run `node <skill-dir>/src/setup.ts --list-models`, which lists the installed Ollama models that have the `decision` capability, and ask the user which one to use. If Ollama cannot be reached, or no decision model is installed, tell the user to install Ollama 0.35 or newer and run `ollama pull nimble`, then stop.
3. Ask whether to classify the whole history or only the latest 200 replies. Each reply takes about half a second.
4. Tell the user that setup adds a Stop hook to `~/.claude/settings.json` that classifies new replies after every turn. After they agree, run `node <skill-dir>/src/setup.ts --model <name>`. It refuses a model that cannot classify, and says why.
5. Run `node <skill-dir>/src/classify-all.ts`, adding `--latest 200` if the user chose the short option. The whole history can take more than ten minutes, so run it in the background and report when it is done.
6. If 500 or more replies were classified, offer to run `rules` right away.

## classify

1. Tell the user this replaces every record in `~/.agent-collab-metrics/reactions.jsonl`, and that each reply takes about half a second. Wait for them to confirm.
2. Run `node <skill-dir>/src/classify-all.ts` with the user's flags. Run it in the background unless `--latest` is small, and report when it is done.

## report

1. Run `node <skill-dir>/src/report.ts` with the user's flags.
2. Point out the projects with the highest `correction` and `confusion` rates, then the sessions with the most problems and what the quotes have in common. Keep the full output available if the user wants it.

## trend

1. Run `node <skill-dir>/src/trend.ts`.
2. Say whether the combined `correction` and `confusion` rate went down in the weeks after each `<- rules updated` mark. Weeks with few replies swing a lot, so don't draw conclusions from them. If there are no marks yet, say that rules have not been applied, so the chart only shows the baseline.
3. If the labels cover only the last few days but the user has older sessions, suggest `classify` without `--latest` to fill in the earlier weeks.

## benchmark

1. Run `node <skill-dir>/src/benchmark.ts`, adding the sample size if the user gave one.
2. Report the median and slowest time per reply, and the estimated time to classify the whole history.

## rules

Run this when the hook reports 500 new replies, or when the user asks.

1. Run `node <skill-dir>/src/report.ts --since-rules`.
2. Read the last section, which quotes the sessions with the most `confusion` or `correction`. Look for what the agent kept doing that the user had to correct or ask about.
3. Draft 3 to 7 short rules under the heading `## Lessons from past conversations`. Each rule must come from a pattern in the quotes, for example "Explain a technical term in one sentence before using it". Leave out anything you cannot tie to a quote. If the quotes show no clear pattern, say so and stop.
4. Show the draft, and explain that it replaces the previous rules inside the `agent-collab-metrics` block of `~/.claude/CLAUDE.md`. Wait for the user to confirm or edit it.
5. Pipe the confirmed rules into `node <skill-dir>/src/apply-rules.ts`, for example with a heredoc. This also restarts the count of 500.
