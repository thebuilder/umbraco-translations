# Client code standards

Linting and formatting are Ultracite (a Biome preset). `biome.jsonc` records every place this
project departs from it, and why; read those comments before adding another.

```bash
pnpm fix      # format and apply the safe fixes
pnpm lint     # report without changing anything
pnpm check    # tsc --noEmit, then lint
```

`pnpm fix` is worth running before you finish, but it is not a substitute for reading the diff.
Two of its passes have been turned off because they changed behaviour here, and `--unsafe` fixes in
particular have emptied hook dependency arrays and rewritten `x!` into `x?.` in this codebase. Apply
those by hand.

## What the linter will not tell you

- **Formatting is settled.** 100 columns, matching the hand-wrapped comments. Do not reflow prose.
- **`useSortedKeys` and `useSortedProperties` are off.** Object key order is observable here (a
  message's placeholders are listed in the order the application declares them), and reordering CSS
  declarations discards the comments written above them.
- **Suppress with a reason, or not at all.** Every `biome-ignore` in this codebase says what the
  rule cannot see -- a roving tabindex, a Lit property assigned by its decorator, an effect
  dependency that is a trigger rather than a read. A suppression without that is a bug in waiting.

## Dead code

`fallow` runs from the workspace root (`pnpm deadcode`) and is part of `pnpm check`. `.fallowrc.jsonc`
lists the entry points Umbraco resolves by name rather than by import; a new one has to be added
there or everything it reaches is reported as unreachable.

Before deleting anything fallow reports, trace it:

```bash
pnpm exec fallow dead-code --trace <file>:<export>
```

An export used only inside its own file is not dead -- drop the `export` keyword instead.
