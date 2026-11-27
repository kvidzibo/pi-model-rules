import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

	// The menu still offers the folder row, so a blank value resets the broken setting.
	const titles: string[] = [];
	const picks = [(options: string[]) => options[0], () => undefined];
	await extension.commands.get("pi-model-rules").handler("", {
		hasUI: true, model: { provider: "test", id: "claude-fable-5-2" }, modelRegistry: { getAvailable: () => [] },
		ui: {
			select: async (title: string, options: string[]) => { titles.push(title); return picks.shift()!(options); },
			input: async () => "",
			notify: (text: string) => assert.fail(text),
		},
	});
	assert.match(titles[0], /Rules not applied: Invalid config/);
	assert.match(titles[1], /1 rule file active/);
	assert.equal(existsSync(join(home, "pi-model-rules.json")), false);

	writeFileSync(join(home, "pi-model-rules.json"), JSON.stringify({ rulesDir: join(home, "moved") }));
	await run("claude-fable-5-2");
	assert.deepEqual(sections, { other: "kept" });
	assert.match(warnings[1], /ENOENT.*model rules not applied/);
});
