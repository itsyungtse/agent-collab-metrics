# agent-collab-metrics

Find the replies your coding agent keeps getting wrong, and turn them into rules it follows next time.

agent-collab-metrics reads the Claude Code session logs already on your machine. It uses a small local model to label how you reacted to each agent reply, then turns the corrections and confusion that keep coming back into rules in your `CLAUDE.md`. There's no proxy and no account, and nothing is written to `CLAUDE.md` until you approve it.

## Why

Every "that's not what I meant" or "wait, what is X?" costs a turn. Across hundreds of sessions those turns add up, and they tend to repeat: the same unexplained jargon, the same overlong answer, the same missed constraint. Claude Code already records all of them in `~/.claude/projects/`.

Keyword matching doesn't find these moments. "Wait, why does this need two services?" contains no word like "wrong", yet it means the explanation didn't land. So agent-collab-metrics has a local decision model read each exchange instead.

## How it works

1. **Classify.** When the agent finishes a reply, a Claude Code Stop hook takes the end of the agent's reply and the message you sent next. It asks an Ollama decision model to label your message as `correction`, `confusion`, `accept` or `new_request`, with a confidence score. Only messages you typed count; subagent traffic, interruptions and text that Claude Code injects are skipped. With `nimble` on Apple silicon, each label takes about 0.4 seconds.
2. **Report.** `/agent-collab-metrics report` shows:
   - label rates per project
   - turns and interruptions per session
   - how much the agent explores before its first edit
   - what replies look like before each kind of reaction
   - the sessions with the most confident corrections and confusion, quoted from the logs
3. **Learn.** After every 500 new labels (change the number with `interval`), the hook suggests `/agent-collab-metrics rules`. Claude reads the quoted sessions and drafts three to seven short rules, each tied to a pattern it found, then shows them to you. Once you approve, they go into a marked block at the end of `~/.claude/CLAUDE.md`. The next update replaces that block, so the file doesn't keep growing.

A rules block looks like this:

```markdown
<!-- agent-collab-metrics:start -->
## Lessons from past conversations

- Explain a technical term in one sentence before using it.
- When the user asks for an example, give it before the general explanation.
<!-- agent-collab-metrics:end -->
```

## Get started

You need:

- Claude Code
- Node 22.18 or later, which runs the TypeScript scripts directly with no build step
- [Ollama](https://ollama.com) 0.35 or later, with a decision model: `ollama pull nimble`

Then say this in Claude Code:

```
Read https://raw.githubusercontent.com/itsyungtse/agent-collab-metrics/main/INSTALL.md and install agent-collab-metrics
```

Claude installs the skill and runs setup with you. It asks which Ollama model to use and whether to label your whole history or only the latest 200 replies, then shows you the Stop hook before adding it to `~/.claude/settings.json`. To install by hand, see [INSTALL.md](INSTALL.md).

Labeling a full history of about 1,400 replies takes around 10 minutes. If you end up with 500 or more labels, setup offers to draft your first rules right away.

## Commands

Run `/agent-collab-metrics <command>`, or ask Claude in your own words.

| Command | What it does |
|---|---|
| `setup` | Pick the decision model, add the Stop hook and label past replies |
| `report [--since-rules] [--confidence 0.6] [--quote-characters 500]` | Show label rates per project and the sessions with the most problems |
| `trend` | Chart the weekly correction and confusion rates, marking the weeks the rules were updated, to check whether the rules help |
| `rules` | Draft rules from the problem sessions and write them into `~/.claude/CLAUDE.md` after you approve |
| `classify [--latest N]` | Label past replies again from scratch |
| `benchmark [sample size]` | Time the decision model on a sample of past replies (200 by default) |
| `interval [replies]` | Show or change how many new labels trigger the rules reminder (500 by default) |

With no command, the skill runs `setup` the first time and lists these commands after that.

## Your data stays local

- Session logs are read on your machine. To label them, they're sent only to Ollama on `localhost`.
- Labels are stored without message text. Each record holds the session id, the message time, the label and its confidence, and a few traits of the agent's reply: its length, whether it had a code block, and how many English terms it used.
- Drafting rules is the one step that shows conversation text to Claude. It reads short quotes from your own sessions, which Claude already saw when they happened.
- Nothing changes in `CLAUDE.md` until you approve the draft.

Everything agent-collab-metrics writes:

| Path | Contents |
|---|---|
| `~/.claude/settings.json` | One Stop hook |
| `~/.claude/CLAUDE.md` | The `agent-collab-metrics` rules block |
| `~/.agent-collab-metrics/config.json` | The decision model you picked, and the rules reminder interval if you changed it |
| `~/.agent-collab-metrics/reactions.jsonl` | One label per message |
| `~/.agent-collab-metrics/state.json` | When rules were applied |

## Update and uninstall

To update to the latest version:

```sh
npx skills update agent-collab-metrics -g
```

To uninstall:

```sh
npx skills remove agent-collab-metrics -g
```

This deletes only the skill files. To finish uninstalling, also remove:

- the Stop hook whose command ends in `agent-collab-metrics/src/hook.ts`, from `~/.claude/settings.json`
- the `agent-collab-metrics` block, from `~/.claude/CLAUDE.md`
- the `~/.agent-collab-metrics/` folder

## Limitations

- **Labels aren't hand-validated yet.** Treat the rates as a direction rather than a measurement. The quoted problem sessions only use labels with a confidence of 0.8 or higher; to change that threshold, pass `--confidence`.
- **Ollama has to be running.** If it isn't, the hook does nothing and catches up at your next reply in the same session. If a session ends while Ollama is down, its messages are labeled only when you run `classify` again.
- **Rules are only as good as the quotes.** A session is quoted only if it has at least two confident problems. Claude is told to leave out any rule it can't tie to a quote. Read the draft before you approve it.

## Development

Run the scripts from a clone:

```sh
node src/setup.ts --list-models     # installed Ollama models with the decision capability
node src/setup.ts --model nimble    # check the model, save it, add the Stop hook
npm run classify -- --latest 200    # label the latest 200 messages; omit --latest for all
npm run report -- --since-rules     # only messages after the last rules update
npm run report -- --confidence 0.6 --quote-characters 500
npm run trend                       # weekly correction and confusion rates
npm run benchmark                   # label a 200-message sample and time it
npm run interval -- 100             # suggest rules every 100 labels; omit the number to print it
npm test
npm run typecheck
```

Labels come from Ollama's System One endpoint (`POST /v1/systemone`). Each request includes the last 1,500 characters of the agent's reply and the first 1,500 characters of your message.

## Roadmap

- Hand-validate a sample of labels
- Wait time per reply, and repeated reads of the same file within a session
