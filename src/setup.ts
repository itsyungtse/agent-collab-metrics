import { join } from "node:path";
import { parseArgs } from "node:util";
import { CLAUDE_SETTINGS_FILE, readJsonFile, saveModelName, writeJsonFile } from "./local-data.ts";
import { OLLAMA_URL, classifyReaction, type PromptWithReply } from "./reaction-classifier.ts";

const HOOK_TIMEOUT_SECONDS = 30;
const SAMPLE_PROMPT_WITH_REPLY: PromptWithReply = {
  projectDirectory: "",
  sessionId: "",
  promptTime: new Date(),
  agentReply: "I renamed the function and updated its three callers.",
  prompt: "Looks good, thanks.",
};

interface HookGroup {
  hooks: { type: string; command: string; timeout: number }[];
}

async function decisionModelNames(): Promise<string[]> {
  const tagsResponse = await fetch(`${OLLAMA_URL}/api/tags`);
  const { models } = (await tagsResponse.json()) as { models: { name: string }[] };
  const decisionModels: string[] = [];
  for (const { name } of models) {
    const showResponse = await fetch(`${OLLAMA_URL}/api/show`, { method: "POST", body: JSON.stringify({ model: name }) });
    const { capabilities = [] } = (await showResponse.json()) as { capabilities?: string[] };
    if (capabilities.includes("decision")) decisionModels.push(name);
  }
  return decisionModels;
}

async function printDecisionModelNames(): Promise<void> {
  try {
    const modelNames = await decisionModelNames();
    console.log(modelNames.length ? modelNames.join("\n") : "no decision model installed, try: ollama pull nimble");
  } catch (error) {
    console.error(`cannot reach Ollama at ${OLLAMA_URL}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

async function canClassify(modelName: string): Promise<boolean> {
  try {
    await classifyReaction(SAMPLE_PROMPT_WITH_REPLY, modelName);
    return true;
  } catch (error) {
    console.error(`${modelName} cannot classify replies: ${(error as Error).message}`);
    console.error("It needs Ollama 0.35+ running on localhost:11434 and a decision model such as nimble.");
    return false;
  }
}

function registerStopHook(): void {
  const command = `node "${join(import.meta.dirname, "hook.ts")}"`;
  const settings = readJsonFile(CLAUDE_SETTINGS_FILE);
  settings.hooks ??= {};
  const stopHookGroups: HookGroup[] = (settings.hooks.Stop ??= []);
  if (stopHookGroups.some((group) => group.hooks.some((hook) => hook.command === command))) {
    console.log(`Stop hook already in ${CLAUDE_SETTINGS_FILE}`);
    return;
  }
  stopHookGroups.push({ hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_SECONDS }] });
  writeJsonFile(CLAUDE_SETTINGS_FILE, settings);
  console.log(`added Stop hook to ${CLAUDE_SETTINGS_FILE}: ${command}`);
}

const { values: options } = parseArgs({
  options: { "list-models": { type: "boolean", default: false }, model: { type: "string" } },
});
if (options["list-models"]) {
  await printDecisionModelNames();
} else if (options.model && (await canClassify(options.model))) {
  saveModelName(options.model);
  console.log(`decision model: ${options.model}`);
  registerStopHook();
} else {
  if (!options.model) console.error("usage: setup.ts --list-models | --model <name>");
  process.exitCode = 1;
}
