import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	assert.deepEqual(await rulesFor(join(dir, "missing"), { provider: "openai", id: "gpt-5" }), { files: [], text: "" });
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
