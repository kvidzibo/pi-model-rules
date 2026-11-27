import { readdir, readFile, stat } from "node:fs/promises";
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
	const parts = pattern.split("*");
	const first = parts[0], last = parts.at(-1)!;
	if (parts.length === 1) return target === pattern;
	if (!target.startsWith(first) || target.length < first.length + last.length) return false;
	// Leftmost placement of each middle literal leaves the most room for the rest.
	let at = first.length;
	for (const part of parts.slice(1, -1)) {
		const found = target.indexOf(part, at);
		if (found < 0) return false;
		at = found + part.length;
	}
	return target.endsWith(last) && target.length - last.length >= at;
}

/** More literal characters, then fewer wildcards, is more specific; ID-only patterns cover any provider. */
function specificity(pattern: string): [number, number] {
	const full = pattern.includes("/") ? pattern : `*/${pattern}`;
	const stars = full.split("*").length - 1;
	return [full.length - stars, -stars];
}

/**
 * Regular `.md` files in the folder, least specific first so the most specific rules come last.
 * A missing folder is an error unless `optional`.
 */
export async function listRules(dir: string, optional = false): Promise<Rule[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
		if (optional && error.code === "ENOENT") return [];
		throw error;
	});
	const rules: Array<Rule & { rank: [number, number] }> = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md") || entry.name.length === 3 || entry.name.startsWith(".")) continue;
		// Symlinked rule files are supported; links to anything else, or dangling links, are not rules.
		const regular = entry.isFile() || (entry.isSymbolicLink() && await stat(join(dir, entry.name)).then((target) => target.isFile(), (error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return false;
			throw error;
		}));
		if (!regular) continue;
		const pattern = patternOf(entry.name);
		rules.push({ file: entry.name, pattern, rank: specificity(pattern) });
	}
	return rules
		.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || (a.file < b.file ? -1 : 1))
		.map(({ file, pattern }) => ({ file, pattern }));
}

/** Concatenated text of the non-empty rule files matching the model. */
export async function rulesFor(dir: string, model: ModelRef, optional = false): Promise<{ files: string[]; text: string }> {
	const files: string[] = [];
	const parts: string[] = [];
	for (const rule of await listRules(dir, optional)) {
		if (!matches(rule.pattern, model)) continue;
		const text = (await readFile(join(dir, rule.file), "utf8")).trim();
		if (!text) continue;
		files.push(rule.file);
		parts.push(text);
	}
	return { files, text: parts.join("\n\n") };
}
