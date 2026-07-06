# Design System

This file records the frontend design tokens and visual rules for the project.
Update it whenever colors, fonts, spacing, breakpoints, radius, shadows, or motion patterns change.
For detailed design-system intent, color-palette usage rules, platform behavior,
mobile notes, and governance, create or update `docs/frontend/design.md` through
`agent-assets/frontend/skills/design-system-steward/SKILL.md`.

## Visual Direction

Current direction: editorial brutalist demo with warm paper texture, hard borders, bold condensed display type,
acid accent color, and utilitarian panels.

Future products may define a new direction, but the chosen direction must be documented here before or during implementation.

## Color Palette

Current demo tokens:

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#171511` | Primary text, borders, dark buttons |
| `--paper` | `#f5efdf` | Page background and light surfaces |
| `--signal` | `#ff4f1f` | High-energy accent, shadows, callouts |
| `--acid` | `#d7ff3f` | Primary highlight and status accent |
| `--mint` | `#85d8c6` | Secondary accent and interaction shadow |
| `--night` | `#1f2a44` | Dark panel background |
| `--line` | `rgba(23, 21, 17, 0.18)` | Subtle line work |
| `--shadow` | `18px 18px 0 rgba(23, 21, 17, 0.13)` | Brutalist panel offset shadow |

Rules:

- Reuse existing tokens before adding new colors.
- New colors must get a semantic role, not only a hex value.
- Avoid introducing random gradients without a documented purpose.
- Check text contrast for every foreground/background pairing.

## Typography

Current demo fonts:

| Font | Source | Usage |
| --- | --- | --- |
| `Bebas Neue` | Google Fonts | Display headings, large metrics |
| `Manrope` | Google Fonts | Body text, controls, labels |

Current usage rules:

- Display headings use uppercase, `Bebas Neue`, tight line-height, no negative letter spacing.
- Body text uses `Manrope` with readable line-height.
- Buttons and labels use bold `Manrope`.

Before adding a new font, document:

- Why the current font pair is insufficient.
- Where the new font is used.
- Fallback behavior.

## Spacing

Current spacing values used in the demo:

| Token Candidate | Value | Usage |
| --- | --- | --- |
| `space-1` | `8px` | Small inline gaps |
| `space-2` | `12px` | Compact padding, badge padding |
| `space-3` | `18px` | Component gaps, card padding |
| `space-4` | `22px` | Panel padding |
| `space-5` | `28px` | Section rhythm |
| `space-6` | `34px` | Action spacing |
| `space-7` | `44px` | Page bottom padding |

Rules:

- Prefer this scale for new UI.
- If a new spacing value repeats, add it here.
- Stable controls, tiles, and toolbars should have fixed or constrained dimensions to prevent layout shifts.

## Borders, Radius, Shadows

Current demo:

- Borders: `2px` for controls and dividers, `3px` for major panels.
- Radius: mostly `0`, matching the brutalist direction.
- Shadows: hard offset shadows, no soft card-like elevation.

Rules:

- Do not mix soft rounded cards into the current brutalist demo without documenting a direction change.
- Cards should stay at `8px` radius or less unless a project-specific system says otherwise.
- Avoid nested card styling.

## Motion

Current demo:

- `blink`: status dot pulse.
- `load`: meter fill animation.
- `rise`: tile entrance animation.
- Button hover uses small translate and shadow reduction.

Rules:

- Motion should clarify state or create one strong moment.
- Prefer CSS-only motion for static HTML.
- Respect reduced-motion needs for larger applications.

## Breakpoints

Current demo breakpoints:

| Breakpoint | Purpose |
| --- | --- |
| `880px` | Collapse hero and strip grids to one column |
| `560px` | Mobile header, typography, stack layout |

Rules:

- Verify desktop and mobile when practical.
- Horizontal overflow is a blocking UI issue.
- Long text must not be clipped inside buttons, cards, panels, or headings.

## Accessibility

Rules:

- Use semantic landmarks where practical.
- Buttons must have clear visible labels or accessible names.
- Color cannot be the only indicator of state.
- Maintain readable contrast and tap targets.
