import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

export interface ProjectAgentsInfo {
	dir: string;
	agentNames: string[];
}

function realpathIfPossible(p: string): string {
	try {
		return fs.realpathSync.native(p);
	} catch {
		return p;
	}
}

const packageDir = realpathIfPossible(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
export const bundledAgentsDir = path.join(packageDir, "agents");

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];
	if (!fs.existsSync(dir)) return agents;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (!frontmatter.name || !frontmatter.description) continue;

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function normalizeSearchStart(cwd: string): string {
	const resolved = realpathIfPossible(path.resolve(cwd));
	return isDirectory(resolved) ? resolved : path.dirname(resolved);
}

export function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = normalizeSearchStart(cwd);
	while (true) {
		const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
		if (isDirectory(candidate)) return realpathIfPossible(candidate);
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function findNearestProjectAgentsInfo(cwd: string): ProjectAgentsInfo | null {
	const dir = findNearestProjectAgentsDir(cwd);
	if (!dir) return null;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return { dir, agentNames: [] };
	}

	const agentNames = entries
		.filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md"))
		.map((entry) => entry.name.replace(/\.md$/, ""))
		.sort();

	return { dir, agentNames };
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);
	const bundledAgents = scope === "project" ? [] : loadAgentsFromDir(bundledAgentsDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");
	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of bundledAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of bundledAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentSourceLabel(source: AgentConfig["source"] | "unknown"): string {
	if (source === "user") return "user (bundled/package)";
	if (source === "project") return "project";
	return "unknown";
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${formatAgentSourceLabel(a.source)}): ${a.description}`).join("; "),
		remaining,
	};
}
