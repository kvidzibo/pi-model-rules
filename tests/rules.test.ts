import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultRulesDir, loadRulesDir, resolveRulesDir, saveRulesDir } from "../src/config.ts";
import { listRules, matches, patternOf, rulesFor } from "../src/rules.ts";

const temp = (t: { after(fn: () => void): void }) => {
	const dir = mkdtempSync(join(tmpdir(), "pi-model-rules-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

test("patterns match the model ID, or provider/id when they contain a slash", () => {
	const fable = { provider: "anthropic", id: "claude-fable-5-2" };
	const routed = { provider: "openrouter", id: "anthropic/claude-fable-5-2" };
	assert.equal(matches(patternOf("claude-*.md"), fable), true);
	assert.equal(matches(patternOf("claude-*.md"), routed), false);
	assert.equal(matches(patternOf("claude-fable-5-2.md"), fable), true);
	assert.equal(matches(patternOf("claude-fable-5.md"), fable), false);
	assert.equal(matches(patternOf("gpt-5.2.md"), { provider: "openai", id: "gpt-5x2" }), false);
	assert.equal(matches(patternOf("anthropic__claude-*.md"), fable), true);
	assert.equal(matches(patternOf("anthropic__claude-*.md"), routed), false);
	assert.equal(matches(patternOf("openrouter__anthropic__claude-*.md"), routed), true);
	assert.equal(matches(patternOf("*.md"), routed), true);
	assert.equal(matches("a*a", { provider: "p", id: "a" }), false);
	assert.equal(matches("c*-f*-2", fable), true);
	assert.equal(matches("c*-x*-2", fable), false);
	assert.equal(matches("*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*b", { provider: "p", id: "a".repeat(5000) }), false);
});

test("matching files are concatenated least specific first; empty and non-rule files are skipped", async (t) => {
	const dir = temp(t);
	writeFileSync(join(dir, "claude-fable-*.md"), "fable\n");
	writeFileSync(join(dir, "*.md"), "\nall\n");
	writeFileSync(join(dir, "anthropic__claude-*.md"), "anthropic");
	writeFileSync(join(dir, "claude-*.md"), "  \n");
	writeFileSync(join(dir, "gpt-*.md"), "gpt");
	writeFileSync(join(dir, "notes.txt"), "ignored");
	assert.deepEqual((await listRules(dir)).map((rule) => rule.file),
		["*.md", "gpt-*.md", "claude-*.md", "claude-fable-*.md", "anthropic__claude-*.md"]);
	assert.deepEqual(await rulesFor(dir, { provider: "anthropic", id: "claude-fable-5-2" }),
		{ files: ["*.md", "claude-fable-*.md", "anthropic__claude-*.md"], text: "all\n\nfable\n\nanthropic" });
	assert.deepEqual(await rulesFor(join(dir, "missing"), { provider: "openai", id: "gpt-5" }, true), { files: [], text: "" });
	await assert.rejects(rulesFor(join(dir, "missing"), { provider: "openai", id: "gpt-5" }), /ENOENT/);
});

test("an exact model ID outranks a broader provider wildcard; only regular files are rules", async (t) => {
	const dir = temp(t);
	writeFileSync(join(dir, "gpt-5.md"), "exact");
	writeFileSync(join(dir, "*__gpt-5*.md"), "broad");
	mkdirSync(join(dir, "gpt-*.md"));
	symlinkSync(join(dir, "gpt-*.md"), join(dir, "gpt-5*.md"));
	symlinkSync(join(dir, "gpt-5.md"), join(dir, "gpt-*5.md"));
	assert.deepEqual(await rulesFor(dir, { provider: "openai", id: "gpt-5" }),
		{ files: ["*__gpt-5*.md", "gpt-*5.md", "gpt-5.md"], text: "broad\n\nexact\n\nexact" });
});

test("rules folder setting persists, resets, and rejects relative paths", async (t) => {
	const agentDir = temp(t);
	assert.deepEqual(await loadRulesDir(agentDir), { dir: defaultRulesDir(agentDir), custom: false });
	assert.equal(resolveRulesDir("rules"), undefined);
	assert.equal(resolveRulesDir("~/rules", "/home/me"), "/home/me/rules");
	await saveRulesDir(agentDir, "/srv/rules");
	assert.deepEqual(JSON.parse(readFileSync(join(agentDir, "pi-model-rules.json"), "utf8")), { rulesDir: "/srv/rules" });
	assert.deepEqual(await loadRulesDir(agentDir), { dir: "/srv/rules", custom: true });
	await saveRulesDir(agentDir, undefined);
	assert.deepEqual(await loadRulesDir(agentDir), { dir: defaultRulesDir(agentDir), custom: false });
	writeFileSync(join(agentDir, "pi-model-rules.json"), '{"rulesDir": "relative"}');
	await assert.rejects(loadRulesDir(agentDir), /Invalid config/);
});
