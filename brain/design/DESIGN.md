# Design

Owns: how the band and the Team panel look, their labels and colors. What they must show: [REQUIREMENTS.md](../product/REQUIREMENTS.md). How they are drawn in code: [ARCHITECTURE.md](../engineering/ARCHITECTURE.md). Maintained by design-advisor; the owner approves changes.

Screenshots: `docs/band.png`, `docs/panel-running.png`, `docs/panel.png`, `docs/panel-colors.png`.

## Principles

- Text only (`Box`, `Text`, `Button`), no SVG, so every surface (terminal, desktop, VS Code, mobile) draws the same thing.
- Bars are `█` filled and `░` empty.

## Progress band

One row, left to right:
- `● ` + task title, in a box sized to the title (up to 40 columns or a third of the width), cut with an ellipsis if longer.
- Tier word, dim, only when set.
- Bar, 6 to 30 wide (scales with width).
- Label, bold: `Done` when finished; otherwise the phase word, plus ` done/total` in Build and Review when there is a total.
- Percent, dim.
- Button `Team ×N` (N = runs + planned), or `Team R/N` while R agents run. Toggles the panel.
- Button `✕` dismisses the band.

Accent `#8f8cf4`; `#5fbf8f` once finished. Other mods' bands draw below this one.

## Team panel

- Bold header `title · Tier · label` while a task is active.
- Dim line `Lead <Model>: <tokens> tok ≈$<cost> · Team: <tokens> tok ≈$<cost>`.
- A blank line, then `No subagents yet.` when empty.
- `Running · N`, newest first.
- Button `▾ Finished · N` / `▸ Finished · N`, which collapses the finished rows.
- `Planned · N`: `◷ n. title · role` for planned tasks not yet started (lead tasks are left out).

Each agent row:
1. Status glyph (`●` running in the agent's color, `✓` done green, `✗` failed red) + bold description.
2. Agent type in its color + ` · <Model>` dim.
3. Bar (8 to 16 wide): filled by self-reported steps in the agent's color, full and green when done, dim when no steps were reported; then ` done/total note · ` (when reported) `<tokens> tok · ≈$<cost> · m:ss`.

Status colors: done `#5fbf8f`, failed `#e5534b`.

## Agent colors

Fixed, all different:

| Type | Color |
|---|---|
| lead | `#8f8cf4` |
| engineer | `#378ADD` |
| senior-engineer | `#D85A30` |
| code-reviewer | `#7F77DD` |
| qa-checker | `#1D9E75` |
| design-advisor | `#D4537E` |
| fork | `#BA7517` |
| Explore | `#94A3B8` |
| general-purpose | `#22D3EE` |
| Plan | `#EAB308` |
| claude-code-guide | `#84CC16` |
| statusline-setup | `#A0673A` |

Any other type gets the next unused color from `#EF4444, #D946EF, #A3A33A, #F472B6, #2DD4BF, #FB923C, #818CF8, #65A30D`, then generated hues (golden-angle steps, 70% saturation, 45 to 65% lightness), skipping any in use. Grey `#888780` marks a row whose type is not known yet.
