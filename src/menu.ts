import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defaultRulesDir, loadRulesDir, resolveRulesDir, saveRulesDir } from "./config.ts";
import { listRules, matches, rulesFor, type ModelRef, type Rule } from "./rules.ts";

const PREVIEW_LINES = 12;
const MODEL_LIMIT = 12;
const name = (model: ModelRef) => `${model.provider}/${model.id}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const reason = (error: unknown) => error instanceof Error ? error.message : String(error);
/** File names and rule text are shown in dialogs; drop terminal control characters, keep tabs and newlines. */
export const visible = (text: string) => text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");

async function showRule(ctx: ExtensionCommandContext, dir: string, rule: Rule, models: ModelRef[]): Promise<void> {
	const matched = models.filter((model) => matches(rule.pattern, model)).map(name);
	const lines = (await readFile(join(dir, rule.file), "utf8")).trim().split("\n");
	const more = lines.length - PREVIEW_LINES;
	await ctx.ui.select(visible([
		join(dir, rule.file),
		`Pattern: ${rule.pattern}`,
		matched.length
			? `Models: ${matched.slice(0, MODEL_LIMIT).join(", ")}${matched.length > MODEL_LIMIT ? `, +${matched.length - MODEL_LIMIT} more` : ""}`
			: "Models: none available",
		"",
		...(lines[0] ? lines.slice(0, PREVIEW_LINES) : ["(empty file — ignored)"]),
		...(more > 0 ? [`… ${plural(more, "more line")}`] : []),
	].join("\n")), ["Back"]);
}

export async function showMenu(ctx: ExtensionCommandContext, agentDir: string): Promise<void> {
	const fallback = defaultRulesDir(agentDir);
	for (;;) {
		// A broken config or folder must not hide the row that fixes it.
		let dir: string | undefined, custom = true, rules: Rule[] = [], active: string[] = [], problem: string | undefined;
		const current = ctx.model;
		try {
			({ dir, custom } = await loadRulesDir(agentDir));
			rules = await listRules(dir, !custom);
			if (current) active = (await rulesFor(dir, current, !custom)).files;
		} catch (error) {
			problem = reason(error);
		}
		const models: ModelRef[] = ctx.modelRegistry.getAvailable();
		const folder = visible(`Rules folder: ${dir ?? "(invalid setting)"}${custom ? "" : " (default)"}`);
		const rows = rules.map((rule) => {
			const count = models.filter((model) => matches(rule.pattern, model)).length;
			return visible(`${rule.file} — ${count ? plural(count, "model") : "no available models"}${active.includes(rule.file) ? " · active" : ""}`);
		});
		const choice = await ctx.ui.select(visible([
			"pi-model-rules",
			current ? `Current model: ${name(current)} — ${plural(active.length, "rule file")} active` : "No model selected",
			...(problem ? [`Rules not applied: ${problem}`]
				: rules.length ? [] : ["No rule files. Add <model-id-glob>.md files to the rules folder, e.g. claude-*.md"]),
		].join("\n")), [folder, ...rows]);
		if (choice === undefined) return;
		if (choice !== folder) {
			await showRule(ctx, dir!, rules[rows.indexOf(choice)], models);
			continue;
		}
		const input = await ctx.ui.input(visible(`Rules folder — absolute or ~/ path; blank resets to ${fallback}`), visible(dir ?? fallback));
		if (input === undefined) continue;
		const next = input.trim() ? resolveRulesDir(input) : undefined;
		if (input.trim() && !next) ctx.ui.notify("Rules folder must be an absolute or ~/ path", "error");
		else await saveRulesDir(agentDir, next === fallback ? undefined : next);
	}
}
