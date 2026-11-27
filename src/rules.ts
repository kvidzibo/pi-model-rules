import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ModelRef {
	provider: string;
	id: string;
}

export interface Rule {
	file: string;
	pattern: string;
}

/** `claude-*.md` → `claude-*`; `__` stands for `/`, which file names cannot contain. */
export function patternOf(file: string): string {
	return file.slice(0, -".md".length).replaceAll("__", "/");
}

/** `*` matches any run of characters. A pattern with `/` targets `provider/id`, otherwise the model ID. */
export function matches(pattern: string, model: ModelRef): boolean {
	const target = pattern.includes("/") ? `${model.provider}/${model.id}` : model.id;
	const source = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
	return new RegExp(`^${source}$`, "s").test(target);
}

const literals = (pattern: string) => pattern.replaceAll("*", "").length;

/** Rule files in the folder, least specific first so the most specific rules come last. */
export async function listRules(dir: string): Promise<Rule[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return [];
		throw error;
	});
	return entries
		.filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md") && entry.name.length > 3 && !entry.name.startsWith("."))
		.map((entry) => ({ file: entry.name, pattern: patternOf(entry.name) }))
		.sort((a, b) => literals(a.pattern) - literals(b.pattern) || (a.file < b.file ? -1 : 1));
}

/** Concatenated text of the non-empty rule files matching the model. */
export async function rulesFor(dir: string, model: ModelRef): Promise<{ files: string[]; text: string }> {
	const files: string[] = [];
	const parts: string[] = [];
	for (const rule of await listRules(dir)) {
		if (!matches(rule.pattern, model)) continue;
		const text = (await readFile(join(dir, rule.file), "utf8")).trim();
		if (!text) continue;
		files.push(rule.file);
		parts.push(text);
	}
	return { files, text: parts.join("\n\n") };
}
