# Install agent-collab-metrics

These steps are written for Claude Code. To install, say this in Claude Code:

```
Read https://raw.githubusercontent.com/itsyungtse/agent-collab-metrics/main/INSTALL.md and install agent-collab-metrics
```

To install by hand, run the command in step 1 yourself, then type `/agent-collab-metrics setup` in Claude Code.

## Steps

1. Install the skill for the user's account, so it works in every project:

   ```sh
   npx skills add itsyungtse/agent-collab-metrics -g -a claude-code
   ```

   This copies the repo into `~/.claude/skills/agent-collab-metrics/`. If the user wants it only in the current project, leave out `-g`; it then goes into the project's `.claude/skills/agent-collab-metrics/`.

2. Read the installed `SKILL.md` and follow its `setup` section. Setup checks Node and Ollama, asks which decision model to use and whether to label the whole history or only the latest 200 replies, and shows the user the Stop hook before adding it to `~/.claude/settings.json`.
