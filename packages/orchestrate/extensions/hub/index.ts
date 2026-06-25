import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { bundledAgentsDir, findNearestProjectAgentsInfo } from "../subagent/agents.ts";

const EDITING_TOOLS = new Set(["write", "edit"]);
const HUB_PROMPT = `
Hub mode is active.
- The main session is an orchestrator only.
- The main session must not edit files directly.
- Use the subagent tool for all repository work.
- If a change is needed, delegate it to an appropriate spoke agent.
`;

function formatProjectAgentGuidance(cwd: string): string {
	const projectAgents = findNearestProjectAgentsInfo(cwd);
	if (!projectAgents) return "";
	return `
- Project-local agents were discovered by walking upward from the current working directory to ${projectAgents.dir}.
- Treat that discovered project-local agent set as the repository's durable bootstrap coverage when it is suitable; do not re-bootstrap just because this package now lives under packages/orchestrate.
- In subagent calls, \`agentScope: "user"\` still means bundled/package agents only; pass \`"agentScope": "both"\` to include these project-local agents.
- Discovered project-local agent names: ${projectAgents.agentNames.length > 0 ? projectAgents.agentNames.join(", ") : "none"}.`;
}

function isMutatingBashCommand(command: string): boolean {
	const normalized = command.trim();
	if (!normalized) return false;
	if (/\b(?:mkdir|rm|mv|cp|touch|chmod|chown|ln|install)\b/.test(normalized)) return true;
	if (/\b(?:sed|perl)\s+-i(?:\b|["'])/.test(normalized)) return true;
	if (/(^|[^0-9])>>?(?![&|])/.test(normalized)) return true;
	if (/\|\s*tee\b/.test(normalized) || /^tee\b/.test(normalized)) return true;
	return false;
}

function loadAgentBody(filePath: string): string {
	const content = fs.readFileSync(filePath, "utf-8");
	const { body } = parseFrontmatter<Record<string, string>>(content);
	return body.trim();
}

export default function hubExtension(pi: ExtensionAPI): void {
	let hubActive = false;
	let toolsBeforeHub: string[] | undefined;
	let promptOverride: string | undefined;

	function loadOrchestratorPrompt(cwd: string = process.cwd()): string {
		const projectAgentsDir = findNearestProjectAgentsInfo(cwd)?.dir;
		if (projectAgentsDir) {
			const projectFilePath = path.join(projectAgentsDir, "orchestrator.md");
			if (fs.existsSync(projectFilePath)) return loadAgentBody(projectFilePath);
		}
		return loadAgentBody(path.join(bundledAgentsDir, "orchestrator.md"));
	}

	function applyHubTools(): void {
		if (toolsBeforeHub === undefined) toolsBeforeHub = pi.getActiveTools();
		const nextTools = [...new Set([...toolsBeforeHub.filter((tool) => !EDITING_TOOLS.has(tool)), "subagent"])];
		pi.setActiveTools(nextTools);
	}

	function restoreTools(): void {
		if (toolsBeforeHub) pi.setActiveTools(toolsBeforeHub);
		toolsBeforeHub = undefined;
	}

	function enableHub(ctx: ExtensionContext, prompt?: string): void {
		hubActive = true;
		promptOverride = prompt;
		applyHubTools();
		ctx.ui.setStatus("hub", ctx.ui.theme.fg("warning", "hub"));
		ctx.ui.notify("Hub mode enabled. Main-session editing tools disabled.", "info");
	}

	function disableHub(ctx: ExtensionContext): void {
		hubActive = false;
		promptOverride = undefined;
		restoreTools();
		ctx.ui.setStatus("hub", undefined);
		ctx.ui.notify("Hub mode disabled. Editing tools restored.", "info");
	}

	pi.registerCommand("hub", {
		description: "Toggle hub orchestration mode; disables main-session editing tools",
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (command === "off" || (hubActive && command !== "on")) disableHub(ctx);
			else enableHub(ctx, loadOrchestratorPrompt(ctx.cwd));
		},
	});

	pi.registerCommand("orchestrate", {
		description: "Bootstrap project-specific agents, then run the orchestrator workflow for an optional goal",
		handler: async (args, ctx) => {
			const goal = args.trim();
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current turn to finish before starting orchestration.", "warning");
				return;
			}
			enableHub(ctx, loadOrchestratorPrompt(ctx.cwd));
			if (goal) {
				pi.sendUserMessage(`First ensure this repository has durable project-scoped agents based on the repo's overall stack and architecture, not on this single task. If suitable project agents do not exist yet, bootstrap and get approval to create them before implementation. Then orchestrate this goal through the hub-and-spoke loop:\n\n${goal}`);
				return;
			}
			pi.sendUserMessage("Bootstrap durable project-scoped agents for this repository based on its overall stack, architecture, and recurring work. Do not derive the agent set from a one-off task. If suitable project agents already exist, report that coverage and stop.");
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!hubActive) return;
		const dynamicHubPrompt = `${HUB_PROMPT}${formatProjectAgentGuidance(ctx.cwd)}`;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${dynamicHubPrompt}\n\n${promptOverride ?? ""}`,
		};
	});

	pi.on("tool_call", async (event) => {
		if (!hubActive) return;
		if (EDITING_TOOLS.has(event.toolName)) {
			return {
				block: true,
				reason: "Hub mode: main-session editing tools are disabled. Delegate file changes through subagent.",
			};
		}
		if (event.toolName === "bash" && isMutatingBashCommand(String(event.args?.command ?? ""))) {
			return {
				block: true,
				reason: "Hub mode: mutating bash commands are disabled in the main session. Delegate repository changes through subagent.",
			};
		}
	});

	pi.on("session_shutdown", async () => {
		hubActive = false;
		promptOverride = undefined;
		toolsBeforeHub = undefined;
	});
}
