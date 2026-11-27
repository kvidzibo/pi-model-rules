import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const configPath = (agentDir: string) => join(agentDir, "pi-model-rules.json");

export const defaultRulesDir = (agentDir: string) => join(agentDir, "model-rules");

/** Expand a leading `~`; only absolute folders are accepted. */
export function resolveRulesDir(input: string, home = homedir()): string | undefined {
	const text = input.trim();
	const expanded = text === "~" ? home : text.startsWith("~/") ? join(home, text.slice(2)) : text;
	return isAbsolute(expanded) ? resolve(expanded) : undefined;
}

export async function loadRulesDir(agentDir: string): Promise<{ dir: string; custom: boolean }> {
	const path = configPath(agentDir);
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { dir: defaultRulesDir(agentDir), custom: false };
		throw error;
	}
	let value: unknown;
	try { value = JSON.parse(text); } catch { value = undefined; }
	const rulesDir = (value as { rulesDir?: unknown } | undefined)?.rulesDir;
	const dir = typeof rulesDir === "string" ? resolveRulesDir(rulesDir) : undefined;
	if (!dir) throw new Error(`Invalid config at ${path}: expected {"rulesDir": "<absolute path>"}`);
	return { dir, custom: true };
}

/** Save a custom rules folder, or reset to the default with `undefined`. */
export async function saveRulesDir(agentDir: string, dir: string | undefined): Promise<void> {
	const path = configPath(agentDir);
	if (dir === undefined) return rm(path, { force: true });
	await mkdir(agentDir, { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify({ rulesDir: dir }, null, 2)}\n`);
	await rename(temp, path);
}
