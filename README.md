# Pi Model Rules

Per-model rules for [Pi](https://pi.dev): like `AGENTS.md`, but each file applies
only while a matching model is active. Inspect them with `/pi-model-rules`.

[npm](https://www.npmjs.com/package/@kvidzibo/pi-model-rules) ·
[GitHub](https://github.com/kvidzibo/pi-model-rules) ·
[Pi package gallery](https://pi.dev/packages)

## Install

Requires Pi 1.6.1 or newer and Node 22.19 or newer.

```sh
pi install npm:@kvidzibo/pi-model-rules
```

Restart Pi, or run `/reload` in an existing session.

## Write rules

Put Markdown files in the rules folder, `~/.pi/agent/model-rules/` by default.
The file name, without `.md`, is a pattern for the models the file applies to:

| File | Applies to |
| --- | --- |
| `claude-fable-5-2.md` | model ID `claude-fable-5-2` on any provider |
| `claude-*.md` | every model ID starting with `claude-` |
| `anthropic__claude-*.md` | the same models, on provider `anthropic` only |
| `openrouter__anthropic__*.md` | OpenRouter models with IDs starting `anthropic/` |
| `*.md` | every model |

- `*` matches any run of characters; matching is case-sensitive.
- `__` stands for `/`. A pattern containing it is matched against
  `provider/model-id`; any other pattern is matched against the model ID alone.
- All matching files apply. They are joined least specific first — fewer literal
  characters, then more wildcards — so the most specific file comes last. For
  this ordering a pattern without a provider counts as `*/pattern`.
- Only regular `.md` files count, including symlinks to them. Empty files are
  ignored.

The text is added to the system prompt as a `<model_rules>` section, alongside
your `AGENTS.md` rules. Files are read at the start of every run, so edits and
model switches take effect on the next prompt without `/reload`. Switching to a
model with no matching file removes the section.

Rules also apply in print, JSON and RPC modes, and in any child Pi process that
loads this package.

## Inspect and configure

Run **`/pi-model-rules`** to see:

- the current model and how many rule files are active for it;
- every rule file, how many available models it matches, and whether it is
  active — files that match no available model are easy to spot;
- a file's pattern, matched models and a preview, by selecting it.

Select **Rules folder** to point the package at another folder, such as one in
a dotfiles repository. Enter an absolute or `~/` path; submit a blank value to
return to the default. The setting is global and stored in
`~/.pi/agent/pi-model-rules.json`.

## Limitations

- Rules are global; there is no per-project rules folder.
- Rule files are trusted instructions. Only point the rules folder at a
  location you control.
- If the config, a custom rules folder or a rule file cannot be read, Pi shows
  a warning once and runs without model rules. `/pi-model-rules` shows the
  cause and still lets you change the folder.
- Windows file names cannot contain `*`, so only exact-ID rule files work on a
  native Windows filesystem.

## Development

```sh
npm install
npm test
```

## License

MIT
