import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

test("manifest loads through Pi and the model_rules section follows the active model", async (t) => {
	const home = mkdtempSync(join(tmpdir(), "pi-model-rules-load-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = home;
	t.after(() => {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(home, { recursive: true, force: true });
	});
	mkdirSync(join(home, "model-rules"));
	writeFileSync(join(home, "model-rules", "claude-*.md"), "Be terse.\n");

	const { loadExtensions } = await import(new URL("./core/extensions/loader.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href);
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const result = await loadExtensions(manifest.pi.extensions.map((path: string) => join(root, path)), home);
	assert.deepEqual(result.errors, []);
	assert.equal(result.extensions.length, 1);
	const extension = result.extensions[0];
	assert.equal(extension.tools.size, 0);
	assert.deepEqual([...extension.commands.keys()], ["pi-model-rules"]);

	const start = extension.handlers.get("before_agent_start")[0];
	const sections: Record<string, string> = { other: "kept" };
	const warnings: string[] = [];
	const run = (id: string) => start({ systemPromptOptions: { sections } },
		{ model: { provider: "test", id }, hasUI: true, ui: { notify: (text: string) => warnings.push(text) } });
	await run("claude-fable-5-2");
	assert.deepEqual(sections, { other: "kept", model_rules: "Be terse." });
	await run("gpt-5");
	assert.deepEqual(sections, { other: "kept" });

	writeFileSync(join(home, "pi-model-rules.json"), "not json");
	await run("claude-fable-5-2");
	await run("claude-fable-5-2");
	assert.deepEqual(sections, { other: "kept" });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /Invalid config.*model rules not applied/);
});
