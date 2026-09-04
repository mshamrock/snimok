# Snimok design system — "Darkroom"

A photo lab lit by one amber lamp. Minimal in element count; character comes
from three consistently applied signatures: **one warm accent**, **mono for
data**, **viewfinder corners** as the only decorative motif. Nothing else:
no gradients, no glass, no illustrations.

## Tokens (`web/src/app/globals.css`)

| Token | Dark (primary) | Light (paper) | Role |
| --- | --- | --- | --- |
| `--background` | `#0f0e0c` | `#f4efe6` | page |
| `--card` | `#17150f` | `#fbf8f2` | panels, controls |
| `--card-2` | `#1f1c16` | `#efe8dc` | hover, chips |
| `--stage` | `#0a0908` | `#e8e1d4` | the area behind an image |
| `--foreground` | `#f1e9da` | `#1b1712` | text |
| `--muted` | `#9c9283` | `#7a705f` | secondary text |
| `--border` | `#2a2620` | `#dfd6c5` | hairlines |
| `--accent` | `#e6a53f` | `#b8791c` | the one accent (actions, corners, markers) |
| `--accent-fg` | `#1a1205` | `#fff8ea` | text on accent |
| `--danger` | `#e5533d` | `#c2412d` | destructive only |

Semantic colours (danger) are not part of the accent budget. Never introduce
a second accent hue.

## Type

- UI: **Instrument Sans** 400 / 500 / 600 (`--font-sans`).
- Data: **JetBrains Mono** 400 / 500 (`--font-mono`) for anything a camera
  would stamp: dimensions, sizes, dates, ids, domains, tags, day headers.
- Utility classes: `.label` = 10.5px uppercase mono, 0.12em tracking, muted;
  `.data` = 12px tabular mono.

## Shape & spacing

- Radius: 6px on controls (`rounded-md`), 8px on cards (`rounded-lg`), 2px on
  images inside the stage. Nothing rounder.
- Hairline borders (`--border`) instead of shadows; shadows only on floating
  menus and toasts.
- Day markers in the timeline are 8px **squares** (not dots).

## The viewfinder corners

`<Corners />` (`web/src/components/Corners.tsx`): four L-shaped 2px strokes in
the accent colour. Used on the image in the stage (16px, offset −8), around the
editor canvas, and on timeline cards on hover (10px, inset 4). Never on text
blocks or buttons.

## Editor

Selection outline and handles use `--accent` (read from CSS at runtime);
handles are filled `#fffaf0`. The text box is paper-coloured.

## Voice

Short, active labels ("Share", "Only me", "Copied"). Dates and sizes always
in mono. Russian-rooted name, English UI for now.
