import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { validateRegistryPackageSpec } from "./package-spec.mjs";

const execFileAsync = promisify(execFile);
const STATUS_KEY = "safe-install";
const SUPPORTED_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"] as const);
const HIGH_RISK_LABEL = "HIGH RISK / DO NOT INSTALL";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
type CheckStatus = "pass" | "warn" | "fail" | "error";
type RiskLabel = "SAFE" | "CAUTION" | typeof HIGH_RISK_LABEL;

interface ParsedCommand {
	packageSpec: string;
	dryRun: boolean;
	dev: boolean;
	exact: boolean;
	manager?: PackageManager;
}

interface ManagerDetection {
	manager: PackageManager;
	source: string;
}

interface PackageJsonLike {
	name?: string;
	version?: string;
	scripts?: Record<string, string>;
	bin?: string | Record<string, string>;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	bundledDependencies?: string[];
	bundleDependencies?: string[];
	os?: string[];
	cpu?: string[];
	gypfile?: boolean;
}

interface NpmViewMetadata {
	name?: string;
	version?: string;
	description?: string;
	dist?: {
		integrity?: string;
		shasum?: string;
		unpackedSize?: number;
		tarball?: string;
	};
	time?: Record<string, string>;
	maintainers?: Array<{ name?: string; email?: string }>;
	repository?: unknown;
	homepage?: string;
	license?: string;
}

interface AuditData {
	metadata?: NpmViewMetadata;
	metadataError?: string;
	packageJson?: PackageJsonLike;
	packageJsonError?: string;
	tarballName?: string;
	files?: string[];
	filesError?: string;
}

interface AuditCheck {
	key: string;
	title: string;
	status: CheckStatus;
	summary: string;
	details: string[];
}

interface AuditResult {
	checks: AuditCheck[];
	risk: RiskLabel;
}

function tokenizeArgs(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	let escaping = false;

	for (const char of input.trim()) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = undefined;
			else current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}

	if (escaping) current += "\\";
	if (quote) throw new Error("Unterminated quoted argument.");
	if (current) tokens.push(current);
	return tokens;
}

function parseCommand(args: string): ParsedCommand {
	const tokens = tokenizeArgs(args);
	if (tokens.length === 0) {
		throw new Error(
			"Usage: /safe-install <package[@version]> [--dry-run] [--dev|-D] [--exact|-E] [--manager npm|pnpm|yarn|bun]",
		);
	}

	let dryRun = false;
	let dev = false;
	let exact = false;
	let manager: PackageManager | undefined;
	const positional: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (token === "--dev" || token === "-D") {
			dev = true;
			continue;
		}
		if (token === "--exact" || token === "-E") {
			exact = true;
			continue;
		}
		if (token === "--manager") {
			const value = tokens[index + 1]?.toLowerCase();
			if (!value || !SUPPORTED_MANAGERS.has(value as PackageManager)) {
				throw new Error("--manager requires one of: npm, pnpm, yarn, bun.");
			}
			manager = value as PackageManager;
			index += 1;
			continue;
		}
		if (token.startsWith("--manager=")) {
			const value = token.slice("--manager=".length).toLowerCase();
			if (!SUPPORTED_MANAGERS.has(value as PackageManager)) {
				throw new Error("--manager requires one of: npm, pnpm, yarn, bun.");
			}
			manager = value as PackageManager;
			continue;
		}
		if (token.startsWith("-")) throw new Error(`Unknown flag: ${token}`);
		positional.push(token);
	}

	if (positional.length !== 1) {
		throw new Error("Provide exactly one npm package spec.");
	}

	const packageSpec = positional[0];
	const validation = validateRegistryPackageSpec(packageSpec);
	if (!validation.ok) {
		throw new Error(validation.reason);
	}

	return {
		packageSpec,
		dryRun,
		dev,
		exact,
		manager,
	};
}

async function runCommand(command: string, args: string[], cwd: string) {
	return execFileAsync(command, args, {
		cwd,
		maxBuffer: 10 * 1024 * 1024,
		env: { ...process.env, npm_config_ignore_scripts: "true" },
	});
}

async function detectPackageManager(cwd: string): Promise<ManagerDetection> {
	try {
		const packageJson = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
			packageManager?: string;
		};
		const declared = packageJson.packageManager?.split("@")[0]?.trim().toLowerCase();
		if (declared && SUPPORTED_MANAGERS.has(declared as PackageManager)) {
			return { manager: declared as PackageManager, source: "package.json#packageManager" };
		}
	} catch {
		// fall through
	}

	const lockfileHints: Array<{ file: string; manager: PackageManager }> = [
		{ file: "pnpm-lock.yaml", manager: "pnpm" },
		{ file: "yarn.lock", manager: "yarn" },
		{ file: "bun.lock", manager: "bun" },
		{ file: "bun.lockb", manager: "bun" },
		{ file: "package-lock.json", manager: "npm" },
	];

	for (const hint of lockfileHints) {
		try {
			await readFile(join(cwd, hint.file));
			return { manager: hint.manager, source: hint.file };
		} catch {
			// keep checking
		}
	}

	return { manager: "npm", source: "default" };
}

async function fetchAuditData(packageSpec: string): Promise<AuditData> {
	const data: AuditData = {};
	const tempRoot = await mkdtemp(join(tmpdir(), "pi-safe-install-"));

	try {
		try {
			const { stdout } = await runCommand("npm", ["view", packageSpec, "--json"], tempRoot);
			data.metadata = JSON.parse(stdout) as NpmViewMetadata;
		} catch (error) {
			data.metadataError = getErrorMessage(error);
		}

		try {
			const { stdout } = await runCommand("npm", ["pack", packageSpec, "--json"], tempRoot);
			const packOutput = JSON.parse(stdout) as Array<{ filename?: string }>;
			const tarballName = packOutput[0]?.filename;
			if (!tarballName) throw new Error("npm pack did not return a tarball filename.");
			data.tarballName = tarballName;

			const tarballPath = join(tempRoot, tarballName);
			await runCommand("tar", ["-xzf", tarballPath, "-C", tempRoot], tempRoot);
			data.packageJson = JSON.parse(await readFile(join(tempRoot, "package", "package.json"), "utf8")) as PackageJsonLike;
			try {
				const { stdout: fileList } = await runCommand("tar", ["-tzf", tarballPath], tempRoot);
				data.files = fileList
					.split(/\r?\n/)
					.map((line) => line.trim())
					.filter(Boolean)
					.map((line) => line.replace(/^package\//, ""));
			} catch (error) {
				data.filesError = getErrorMessage(error);
			}
		} catch (error) {
			data.packageJsonError = getErrorMessage(error);
		}
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}

	return data;
}

function getErrorMessage(error: unknown): string {
	if (error && typeof error === "object") {
		const stderr = "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
		const stdout = "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
		const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
		return [message, stderr, stdout].filter(Boolean).join("\n").trim() || "Unknown error.";
	}
	return String(error);
}

function daysSince(isoDate: string | undefined): number | undefined {
	if (!isoDate) return undefined;
	const time = Date.parse(isoDate);
	if (Number.isNaN(time)) return undefined;
	return Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
}

function countRecordKeys(value: Record<string, string> | undefined): number {
	return value ? Object.keys(value).length : 0;
}

function createChecks(data: AuditData): AuditCheck[] {
	const checks: AuditCheck[] = [];
	const metadata = data.metadata;
	const packageJson = data.packageJson;
	const files = data.files ?? [];

	if (metadata) {
		checks.push({
			key: "metadata",
			title: "Registry metadata",
			status: metadata.name && metadata.version && (metadata.dist?.integrity || metadata.dist?.shasum) ? "pass" : "warn",
			summary: metadata.name && metadata.version
				? `Resolved ${metadata.name}@${metadata.version}.`
				: "Metadata resolved, but key fields were missing.",
			details: [
				metadata.license ? `License: ${metadata.license}` : "License missing from npm view output.",
				metadata.homepage ? `Homepage: ${metadata.homepage}` : "Homepage not declared.",
				metadata.dist?.integrity ? "Integrity hash present." : "Integrity hash missing.",
			],
		});
	} else {
		checks.push({
			key: "metadata",
			title: "Registry metadata",
			status: "fail",
			summary: "Could not resolve npm registry metadata.",
			details: [data.metadataError ?? "Unknown metadata error."],
		});
	}

	if (metadata?.version) {
		const versionPublishedDays = daysSince(metadata.time?.[metadata.version]);
		const createdDays = daysSince(metadata.time?.created);
		let status: CheckStatus = "pass";
		const details: string[] = [];
		if (versionPublishedDays === undefined) {
			status = "warn";
			details.push("Could not determine when the selected version was published.");
		} else if (versionPublishedDays <= 7) {
			status = "fail";
			details.push(`Selected version was published ${versionPublishedDays} day(s) ago.`);
		} else if (versionPublishedDays <= 30) {
			status = "warn";
			details.push(`Selected version was published ${versionPublishedDays} day(s) ago.`);
		} else {
			details.push(`Selected version was published ${versionPublishedDays} day(s) ago.`);
		}
		if (createdDays !== undefined) details.push(`Package first appeared ${createdDays} day(s) ago.`);
		checks.push({
			key: "publish-age",
			title: "Publish recency",
			status,
			summary:
				status === "fail"
					? "Very new publish; treat as high risk until it has aged."
					: status === "warn"
						? "Recently published or publish timing unclear."
						: "Publish timing looks mature enough for a preliminary install.",
			details,
		});
	} else {
		checks.push({
			key: "publish-age",
			title: "Publish recency",
			status: "error",
			summary: "Could not evaluate publish timing.",
			details: ["Selected version is unavailable because metadata could not be resolved."],
		});
	}

	if (metadata?.maintainers) {
		const maintainerCount = metadata.maintainers.length;
		const status: CheckStatus = maintainerCount === 0 ? "warn" : maintainerCount === 1 ? "warn" : "pass";
		checks.push({
			key: "maintainers",
			title: "Maintainer surface",
			status,
			summary:
				maintainerCount === 0
					? "No maintainer records were exposed."
					: maintainerCount === 1
						? "Single maintainer listed; bus-factor caution."
						: `${maintainerCount} maintainers listed.`,
			details:
				maintainerCount > 0
					? metadata.maintainers.map((maintainer) => `${maintainer.name ?? "unknown"}${maintainer.email ? ` <${maintainer.email}>` : ""}`)
					: ["npm view returned no maintainer entries."],
		});
	} else {
		checks.push({
			key: "maintainers",
			title: "Maintainer surface",
			status: "error",
			summary: "Could not inspect maintainers.",
			details: ["Maintainer data was unavailable from registry metadata."],
		});
	}

	if (packageJson) {
		const scripts = packageJson.scripts ?? {};
		const riskyScripts = Object.entries(scripts).filter(([name]) =>
			["preinstall", "install", "postinstall", "prepare"].includes(name),
		);
		const status: CheckStatus = riskyScripts.length > 0 ? "fail" : "pass";
		checks.push({
			key: "scripts",
			title: "Lifecycle scripts",
			status,
			summary:
				status === "fail"
					? "Install-time lifecycle scripts were found."
					: "No install-time lifecycle scripts were found in the packed manifest.",
			details:
				riskyScripts.length > 0
					? riskyScripts.map(([name, value]) => `${name}: ${value}`)
					: ["Checked preinstall, install, postinstall, and prepare."],
		});
	} else {
		checks.push({
			key: "scripts",
			title: "Lifecycle scripts",
			status: "error",
			summary: "Could not inspect packed package.json scripts.",
			details: [data.packageJsonError ?? "Unknown package.json inspection error."],
		});
	}

	if (packageJson) {
		const binCount = typeof packageJson.bin === "string" ? 1 : countRecordKeys(packageJson.bin);
		const nativeFiles = files.filter((file) => /(^|\/)(binding\.gyp|prebuilds\/|build\/Release\/|.*\.(node|dll|so|dylib))$/i.test(file));
		let status: CheckStatus = "pass";
		const details = [
			binCount > 0 ? `Bin entries: ${binCount}` : "No bin entries.",
			packageJson.gypfile ? "gypfile flag enabled." : "No gypfile flag.",
			packageJson.os?.length ? `OS constraints: ${packageJson.os.join(", ")}` : "No OS constraints.",
			packageJson.cpu?.length ? `CPU constraints: ${packageJson.cpu.join(", ")}` : "No CPU constraints.",
		];
		if (binCount > 0 || packageJson.gypfile || nativeFiles.length > 0 || packageJson.os?.length || packageJson.cpu?.length) {
			status = nativeFiles.length > 0 ? "fail" : "warn";
		}
		if (nativeFiles.length > 0) details.push(`Native/prebuilt files: ${nativeFiles.slice(0, 8).join(", ")}`);
		checks.push({
			key: "surface",
			title: "Executable/native surface",
			status,
			summary:
				status === "fail"
					? "Native or prebuilt artifacts were detected."
					: status === "warn"
						? "Package exposes executables or platform-specific behavior."
						: "No obvious executable or native artifact risk signals were found.",
			details,
		});
	} else {
		checks.push({
			key: "surface",
			title: "Executable/native surface",
			status: "error",
			summary: "Could not inspect the packed tarball contents.",
			details: [data.packageJsonError ?? data.filesError ?? "Unknown tarball inspection error."],
		});
	}

	if (packageJson) {
		const dependencyCount = countRecordKeys(packageJson.dependencies);
		const optionalDependencyCount = countRecordKeys(packageJson.optionalDependencies);
		const peerDependencyCount = countRecordKeys(packageJson.peerDependencies);
		const bundledDependencyCount = (packageJson.bundledDependencies ?? packageJson.bundleDependencies ?? []).length;
		const unpackedSize = metadata?.dist?.unpackedSize;
		let status: CheckStatus = "pass";
		if (dependencyCount > 80 || optionalDependencyCount > 0 || bundledDependencyCount > 0) status = "warn";
		if ((unpackedSize ?? 0) > 10 * 1024 * 1024 || dependencyCount > 150) status = "fail";
		checks.push({
			key: "dependencies",
			title: "Dependency and size surface",
			status,
			summary:
				status === "fail"
					? "Dependency graph or package size is unusually large."
					: status === "warn"
						? "Dependency graph is broad enough to warrant extra review."
						: "Dependency and size surface look modest.",
			details: [
				`dependencies: ${dependencyCount}`,
				`optionalDependencies: ${optionalDependencyCount}`,
				`peerDependencies: ${peerDependencyCount}`,
				`bundledDependencies: ${bundledDependencyCount}`,
				unpackedSize ? `unpackedSize: ${Math.round(unpackedSize / 1024)} KiB` : "unpackedSize unavailable.",
			],
		});
	} else {
		checks.push({
			key: "dependencies",
			title: "Dependency and size surface",
			status: "error",
			summary: "Could not inspect dependency or size surface.",
			details: [data.packageJsonError ?? "Unknown dependency inspection error."],
		});
	}

	return checks;
}

function computeRisk(checks: AuditCheck[]): RiskLabel {
	if (checks.some((check) => check.status === "fail")) return HIGH_RISK_LABEL;
	if (checks.some((check) => check.status === "error" || check.status === "warn")) return "CAUTION";
	return "SAFE";
}

function buildInstallCommand(command: ParsedCommand, manager: PackageManager): string[] {
	const args = manager === "npm" ? ["install"] : [manager === "yarn" ? "add" : "add"];
	args.push(command.packageSpec);
	if (command.dev) args.push(manager === "npm" ? "--save-dev" : "--dev");
	if (command.exact) args.push(manager === "npm" ? "--save-exact" : "--exact");
	args.push("--ignore-scripts");
	return args;
}

function iconForStatus(status: CheckStatus): string {
	switch (status) {
		case "pass":
			return "✅";
		case "warn":
			return "⚠️";
		case "fail":
			return "⛔";
		case "error":
			return "❓";
	}
}

function buildReport(
	command: ParsedCommand,
	manager: ManagerDetection,
	audit: AuditResult,
	plannedArgs: string[],
	outcome: string,
): string {
	const lines: string[] = [];
	lines.push(`# /safe-install audit for \`${command.packageSpec}\``);
	lines.push("");
	lines.push(`- Preliminary risk: **${audit.risk}**`);
	lines.push(`- Package manager: **${manager.manager}** (${manager.source})`);
	lines.push(`- Mode: **${command.dryRun ? "dry-run" : "install"}**`);
	lines.push(`- Planned command: \`${manager.manager} ${plannedArgs.join(" ")}\``);
	lines.push(`- Outcome: **${outcome}**`);
	lines.push("");
	lines.push("## Audit checks");
	lines.push("");
	lines.push("| Check | Status | Summary |");
	lines.push("| --- | --- | --- |");
	for (const check of audit.checks) {
		lines.push(`| ${check.title} | ${iconForStatus(check.status)} ${check.status.toUpperCase()} | ${escapeTableText(check.summary)} |`);
	}
	lines.push("");
	for (const check of audit.checks) {
		lines.push(`### ${iconForStatus(check.status)} ${check.title}`);
		lines.push("");
		lines.push(check.summary);
		lines.push("");
		for (const detail of check.details) lines.push(`- ${detail}`);
		lines.push("");
	}
	lines.push("> Note: this implementation audits npm registry metadata and tarball contents, then installs with `--ignore-scripts`. It intentionally supports a single npm registry package spec per command run.");
	return lines.join("\n");
}

function escapeTableText(value: string): string {
	return value.replace(/\|/g, "\\|");
}

export default function safeInstallExtension(pi: ExtensionAPI): void {
	pi.registerCommand("safe-install", {
		description:
			"Audit an npm package before adding it with the detected package manager and --ignore-scripts.",
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current agent turn to finish before running /safe-install.", "warning");
				return;
			}

			let parsed: ParsedCommand;
			try {
				parsed = parseCommand(args);
			} catch (error) {
				ctx.ui.notify(getErrorMessage(error), "error");
				return;
			}

			ctx.ui.setStatus(STATUS_KEY, `auditing ${parsed.packageSpec}`);
			ctx.ui.notify(`Auditing ${parsed.packageSpec}…`, "info");

			try {
				const detectedManager = parsed.manager
					? { manager: parsed.manager, source: "--manager override" }
					: await detectPackageManager(ctx.cwd);
				const auditData = await fetchAuditData(parsed.packageSpec);
				const checks = createChecks(auditData);
				const audit: AuditResult = { checks, risk: computeRisk(checks) };
				const plannedArgs = buildInstallCommand(parsed, detectedManager.manager);

				if (parsed.dryRun) {
					const report = buildReport(parsed, detectedManager, audit, plannedArgs, "Dry run only; nothing was installed.");
					await pi.sendUserMessage(report);
					ctx.ui.notify("Dry run complete. Audit report sent to the session.", "info");
					return;
				}

				if (audit.risk === HIGH_RISK_LABEL) {
					const report = buildReport(parsed, detectedManager, audit, plannedArgs, "Blocked before install because the package is high risk.");
					await pi.sendUserMessage(report);
					ctx.ui.notify("Blocked: package marked HIGH RISK / DO NOT INSTALL.", "error");
					return;
				}

				if (!ctx.hasUI) {
					const report = buildReport(
						parsed,
						detectedManager,
						audit,
						plannedArgs,
						"Install not started because explicit confirmation was required but no UI was available.",
					);
					await pi.sendUserMessage(report);
					return;
				}

				const confirmed = await ctx.ui.confirm(
					`Install ${parsed.packageSpec}?`,
					`Risk: ${audit.risk}\nManager: ${detectedManager.manager}\nCommand: ${detectedManager.manager} ${plannedArgs.join(" ")}`,
				);
				if (!confirmed) {
					const report = buildReport(parsed, detectedManager, audit, plannedArgs, "User declined install after reviewing the audit.");
					await pi.sendUserMessage(report);
					ctx.ui.notify("Install cancelled.", "info");
					return;
				}

				ctx.ui.setStatus(STATUS_KEY, `installing ${parsed.packageSpec}`);
				ctx.ui.notify(`Installing ${parsed.packageSpec} with ${detectedManager.manager} --ignore-scripts…`, "info");

				try {
					await runCommand(detectedManager.manager, plannedArgs, ctx.cwd);
					const report = buildReport(parsed, detectedManager, audit, plannedArgs, "Install completed successfully.");
					await pi.sendUserMessage(report);
					ctx.ui.notify(`Installed ${parsed.packageSpec}.`, "info");
				} catch (error) {
					const report = buildReport(
						parsed,
						detectedManager,
						audit,
						plannedArgs,
						`Install failed: ${getErrorMessage(error).split("\n")[0] ?? "Unknown error."}`,
					);
					await pi.sendUserMessage(report);
					ctx.ui.notify(`Install failed for ${parsed.packageSpec}.`, "error");
				}
			} catch (error) {
				ctx.ui.notify(`safe-install failed: ${getErrorMessage(error)}`, "error");
			} finally {
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		},
	});
}
