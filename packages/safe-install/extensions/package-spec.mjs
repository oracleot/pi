/**
 * @typedef {{ ok: true, name: string, selector?: string } | { ok: false, reason: string }} ValidationResult
 */

const PACKAGE_SEGMENT = "[a-z0-9][a-z0-9._-]*";
const SCOPED_NAME = new RegExp(`^@(${PACKAGE_SEGMENT})\\/(${PACKAGE_SEGMENT})(?:@(.+))?$`);
const UNSCOPED_NAME = new RegExp(`^(${PACKAGE_SEGMENT})(?:@(.+))?$`);
const BANNED_SPEC_PREFIX = /^(?:npm|file|link|workspace):/i;
const BANNED_SELECTOR_PREFIX = /^(?:npm|file|link|workspace|git|git\+ssh|git\+https|git\+http|https?|ssh):/i;
const SAFE_SELECTOR = /^(?!\.)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9*^~<>=|.+_-]+$/;

/**
 * @param {string} packageSpec
 * @returns {ValidationResult}
 */
export function validateRegistryPackageSpec(packageSpec) {
	const spec = packageSpec.trim();
	if (!spec) {
		return { ok: false, reason: "Provide exactly one npm registry package spec." };
	}
	if (BANNED_SPEC_PREFIX.test(spec)) {
		return { ok: false, reason: "Only direct npm registry package names are allowed; aliases and file/link/workspace protocols are rejected." };
	}
	if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~") || /^[A-Za-z]:[\\/]/.test(spec)) {
		return { ok: false, reason: "Only npm registry package names are allowed; local and absolute paths are rejected." };
	}
	if (spec.includes("://") || spec.includes("\\")) {
		return { ok: false, reason: "Only npm registry package names are allowed; URLs and non-registry specs are rejected." };
	}

	const match = spec.startsWith("@") ? spec.match(SCOPED_NAME) : spec.match(UNSCOPED_NAME);
	if (!match) {
		return { ok: false, reason: "Package spec must be an npm registry package name with at most one optional @version, range, or tag." };
	}

	const selector = match[match.length - 1];
	if (!selector) {
		return { ok: true, name: spec };
	}
	if (selector.includes("/") || selector.includes("\\")) {
		return { ok: false, reason: "Only npm registry package versions, ranges, or dist-tags are allowed; paths, git specs, tarballs, and GitHub shorthands are rejected." };
	}
	if (selector.includes(":") || BANNED_SELECTOR_PREFIX.test(selector)) {
		return { ok: false, reason: "Only npm registry package versions, ranges, or dist-tags are allowed; protocol-based specs are rejected." };
	}
	if (!SAFE_SELECTOR.test(selector)) {
		return { ok: false, reason: "Package version selector must be a registry version, range, or dist-tag without spaces or path-like syntax." };
	}

	return { ok: true, name: spec.slice(0, spec.length - selector.length - 1), selector };
}
