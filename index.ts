import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadRulesDir } from "./src/config.ts";
import { showMenu } from "./src/menu.ts";
import { rulesFor } from "./src/rules.ts";

const SECTION = "model_rules";
const message = (error: unknown) => `pi-model-rules: ${error instanceof Error ? error.message : String(error)}`;

export default function (pi: ExtensionAPI) {
	let reported: string | undefined;
	// Rule files are read on every run, so edits and model switches apply without /reload.
	pi.on("before_agent_start", async (event, ctx) => {
		const sections = event.systemPromptOptions.sections;
		let text = "";
		try {
			if (ctx.model) {
				// Only the unconfigured default folder may be absent; a missing custom folder is a mistake.
				const { dir, custom } = await loadRulesDir(getAgentDir());
				text = (await rulesFor(dir, ctx.model, !custom)).text;
			}
			reported = undefined;
		} catch (error) {
			const warning = `${message(error)} — model rules not applied`;
			if (warning !== reported) {
				if (ctx.hasUI) ctx.ui.notify(warning, "warning");
				else console.error(warning);
			}
			reported = warning;
		}
		if (text) sections[SECTION] = text;
		else delete sections[SECTION];
	});

	pi.registerCommand("pi-model-rules", {
		description: "Show per-model rule files and set the rules folder",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			try {
				await showMenu(ctx, getAgentDir());
			} catch (error) {
				ctx.ui.notify(message(error), "error");
			}
		},
	});
}
