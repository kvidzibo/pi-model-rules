import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defaultRulesDir, loadRulesDir, resolveRulesDir, saveRulesDir } from "./config.ts";
import { listRules, matches, type ModelRef, type Rule } from "./rules.ts";

const PREVIEW_LINES = 12;
const MODEL_LIMIT = 12;
const name = (model: ModelRef) => `${model.provider}/${model.id}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

async function showRule(ctx: ExtensionCommandContext, dir: string, rule: Rule, models: ModelRef[]): Promise<void> {
	const matched = models.filter((model) => matches(rule.pattern, model)).map(name);
	const lines = (await readFile(join(dir, rule.file), "utf8")).trim().split("\n");
	const more = lines.length - PREVIEW_LINES;
	await ctx.ui.select([
		join(dir, rule.file),
		`Pattern: ${rule.pattern}`,
		matched.length
			? `Models: ${matched.slice(0, MODEL_LIMIT).join(", ")}${matched.length > MODEL_LIMIT ? `, +${matched.length - MODEL_LIMIT} more` : ""}`
			: "Models: none available",
		"",
		...(lines[0] ? lines.slice(0, PREVIEW_LINES) : ["(empty file — ignored)"]),
		...(more > 0 ? [`… ${plural(more, "more line")}`] : []),
	].join("\n"), ["Back"]);
}

export async function showMenu(ctx: ExtensionCommandContext, agentDir: string): Promise<void> {
	for (;;) {
		const { dir, custom } = await loadRulesDir(agentDir);
		const rules = await listRules(dir);
		const models: ModelRef[] = ctx.modelRegistry.getAvailable();
		const current = ctx.model;
		const active = current ? rules.filter((rule) => matches(rule.pattern, current)) : [];
		const folder = `Rules folder: ${dir}${custom ? "" : " (default)"}`;
		const rows = rules.map((rule) => {
			const count = models.filter((model) => matches(rule.pattern, model)).length;
			return `${rule.file} — ${count ? plural(count, "model") : "no available models"}${active.includes(rule) ? " · active" : ""}`;
		});
		const choice = await ctx.ui.select([
			"pi-model-rules",
			current ? `Current model: ${name(current)} — ${plural(active.length, "rule file")} active` : "No model selected",
			...(rules.length ? [] : ["No rule files. Add <model-id-glob>.md files to the rules folder, e.g. claude-*.md"]),
		].join("\n"), [folder, ...rows]);
		if (choice === undefined) return;
		if (choice !== folder) {
			await showRule(ctx, dir, rules[rows.indexOf(choice)], models);
			continue;
		}
		const fallback = defaultRulesDir(agentDir);
		const input = await ctx.ui.input(`Rules folder — absolute or ~/ path; blank resets to ${fallback}`, dir);
		if (input === undefined) continue;
		const next = input.trim() ? resolveRulesDir(input) : undefined;
		if (input.trim() && !next) ctx.ui.notify("Rules folder must be an absolute or ~/ path", "error");
		else await saveRulesDir(agentDir, next === fallback ? undefined : next);
	}
}
