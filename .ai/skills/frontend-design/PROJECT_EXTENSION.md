# Project Extension: Frontend UI Governance

This project extends the official Anthropic `frontend-design` skill with UI governance.
The official skill still defines visual quality. This extension defines project memory,
design-system control, and documentation requirements.

## When This Extension Applies

Use this extension for any frontend task involving:

- UI components, pages, screens, layouts, routes, dashboards, tools, forms, dialogs, menus, navigation, charts, or games.
- CSS, design tokens, colors, typography, spacing, shadows, motion, responsive behavior, or visual QA.
- Adding, removing, renaming, restyling, or reusing any UI component.

If a task might affect the user interface, assume this extension applies.

## Required Project Memory

The agent must maintain `docs/frontend/` as the source of truth for the UI system:

- `README.md`: orientation, required workflow, and file map.
- `design-system.md`: colors, typography, spacing, radii, shadows, motion, breakpoints, and accessibility rules.
- `components.md`: component inventory, variants, states, props, paths, and reuse guidance.
- `screens.md`: page, route, and layout inventory.
- `ui-decisions.md`: dated decisions and rationale.
- `audit-checklist.md`: verification checklist for frontend completion.

## Required Workflow

Before frontend implementation:

1. Read the relevant files in `docs/frontend/`.
2. Inspect existing UI code, styles, assets, and component names.
3. Reuse documented components and tokens before inventing new ones.
4. Identify any new component, color, font, spacing scale, breakpoint, or motion pattern that the task requires.

During implementation:

1. Use named tokens or documented values where the project has them.
2. Do not introduce a new color, font, spacing scale, radius, shadow, breakpoint, or animation without adding it to `docs/frontend/design-system.md`.
3. Do not introduce a new reusable UI component without adding it to `docs/frontend/components.md`.
4. Do not create a new screen, route, or major layout without adding it to `docs/frontend/screens.md`.
5. Keep UI text, spacing, and layout consistent with the documented system unless the task intentionally changes the system.

After implementation:

1. Update `docs/frontend/` in the same change as the UI code.
2. Add or update a decision in `docs/frontend/ui-decisions.md` for meaningful visual or system changes.
3. Run the app or open the page when practical.
4. Verify desktop and mobile layouts when practical.
5. Fix clipped text, overlap, incoherent spacing, horizontal overflow, broken states, and console errors before finishing.

## Component Control Rules

Every reusable UI component should have:

- Name.
- Source path.
- Purpose.
- Variants.
- States.
- Inputs or props, if applicable.
- Design tokens used.
- Accessibility notes.
- Reuse guidance.
- Status: `active`, `experimental`, `deprecated`, or `planned`.

Prefer updating an existing component over creating a near-duplicate. If duplication is intentional,
record the reason in `docs/frontend/ui-decisions.md`.

## Design Token Control Rules

All design values that repeat or define visual identity should be documented:

- Palette and semantic color roles.
- Typography families, weights, sizes, line heights, and usage.
- Spacing scale.
- Border radius scale.
- Shadow and elevation styles.
- Motion durations, easing, and interaction patterns.
- Breakpoints and responsive rules.

New tokens should include usage guidance. Avoid one-off values unless they are local to a single
composition and clearly not part of the system.

## Completion Criteria

A frontend task is not complete until:

- UI code is implemented.
- Relevant `docs/frontend/` files are updated.
- Existing system choices were reused or the change rationale was recorded.
- Visual verification was performed when practical.
- Obvious UI issues were fixed.
