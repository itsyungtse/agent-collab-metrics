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
3. **Learn.** After every 500 new labels, the hook suggests `/agent-collab-metrics rules`. Claude reads the quoted sessions and drafts three to seven short rules, each tied to a pattern it found, then shows them to you. Once you approve, they go into a marked block at the end of `~/.claude/CLAUDE.md`. The next update replaces that block, so the file doesn't keep growing.

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

Install the skill for your user account so it works in every project:

```sh
npx skills add itsyungtse/agent-collab-metrics -g -a claude-code
```

This copies the repo into `~/.claude/skills/agent-collab-metrics/`. Leave out `-g` to install it into the current project's `.claude/skills/` instead.

Then run setup in Claude Code:

```
/agent-collab-metrics setup
```

Setup works through these steps:

1. Checks your Node version.
2. Lists the installed Ollama models that can make decisions and asks which one to use.
3. Asks whether to label your whole history or only the latest 200 replies.
4. Shows you the Stop hook, then adds it to `~/.claude/settings.json`.

Labeling a full history of about 1,400 replies takes around 10 minutes. If you end up with 500 or more labels, setup offers to draft your first rules right away.

## Commands

Run `/agent-collab-metrics <command>`, or ask Claude in your own words.

| Command | What it does |
|---|---|
| `setup` | Pick the decision model, add the Stop hook and label past replies |
| `report [--since-rules] [--confidence 0.6] [--quote-characters 500]` | Show label rates per project and the sessions with the most problems |
| `rules` | Draft rules from the problem sessions and write them into `~/.claude/CLAUDE.md` after you approve |
| `classify [--latest N]` | Label past replies again from scratch |
| `benchmark [sample size]` | Time the decision model on a sample of past replies (200 by default) |

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
| `~/.agent-collab-metrics/config.json` | The decision model you picked |
| `~/.agent-collab-metrics/reactions.jsonl` | One label per message |
| `~/.agent-collab-metrics/state.json` | When rules were last applied |

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
npm run benchmark                   # label a 200-message sample and time it
npm test
npm run typecheck
```

Labels come from Ollama's System One endpoint (`POST /v1/systemone`). Each request includes the last 1,500 characters of the agent's reply and the first 1,500 characters of your message.

## Roadmap

- Hand-validate a sample of labels
- Wait time per reply, and repeated reads of the same file within a session
