import test from "node:test";
import assert from "node:assert/strict";

import { validateRegistryPackageSpec } from "./package-spec.mjs";

test("accepts direct npm registry package names, scopes, and safe selectors", () => {
	for (const value of [
		"zod",
		"lodash@4.17.21",
		"lodash@^4.17.21",
		"@types/node",
		"@types/node@latest",
		"react-dom@18.x",
	]) {
		assert.equal(validateRegistryPackageSpec(value).ok, true, value);
	}
});

test("rejects aliases, paths, URLs, git specs, GitHub shorthands, and protocols", () => {
	for (const value of [
		"npm:zod",
		"file:../local-package",
		"link:../local-package",
		"workspace:*",
		"../local-package",
		"./local-package",
		"/tmp/local-package",
		"git+https://github.com/npm/cli.git",
		"github:npm/cli",
		"npm/cli",
		"https://registry.npmjs.org/zod/-/zod-1.0.0.tgz",
		"zod@https://registry.npmjs.org/zod/-/zod-1.0.0.tgz",
		"zod@github:npm/cli",
	]) {
		assert.equal(validateRegistryPackageSpec(value).ok, false, value);
	}
});
