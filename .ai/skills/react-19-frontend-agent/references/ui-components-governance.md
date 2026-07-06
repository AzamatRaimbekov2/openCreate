# UI Components

This file records reusable UI components and visual patterns. Update it whenever a component is added,
removed, renamed, restyled, or given a new variant/state.

## Component Inventory

| Component | Path | Purpose | Variants | States | Tokens | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `Topbar` | `frontend-design-demo.html` | Header mark and skill status area | default | status pulse | `--ink`, `--signal`, `--acid` | active |
| `HeroPanel` | `frontend-design-demo.html` | Main explanatory hero panel | default | responsive desktop/mobile | `--paper`, `--ink`, `--shadow` | active |
| `ActionButton` | `frontend-design-demo.html` | Primary and secondary calls to action | primary, secondary | hover | `--ink`, `--paper`, `--signal`, `--mint` | active |
| `MetricMeter` | `frontend-design-demo.html` | Dark metric panel with progress gauge | default | load animation | `--night`, `--acid`, `--paper` | active |
| `NotePanel` | `frontend-design-demo.html` | Highlight callout panel | acid note | static | `--acid`, `--ink` | active |
| `FeatureGrid` | `frontend-design-demo.html` | Two-by-two feature chip grid | desktop, mobile stacked | static | `--ink`, `--paper` | active |
| `FeatureTile` | `frontend-design-demo.html` | Bottom feature summary tiles | neutral, mint, signal | entrance animation | `--paper`, `--mint`, `--signal` | active |

## Component Documentation Template

Use this template for new components:

```md
### ComponentName

- Path:
- Purpose:
- Variants:
- States:
- Inputs or props:
- Design tokens:
- Accessibility:
- Reuse guidance:
- Status:
```

## Reuse Rules

- Search this file before creating a new component.
- Use documented project components and active skill-provided UI components before reaching for external component sources.
- If an active UI skill gives a specific component priority, follow it before shadcn. Example: a LobeHub-style skill may require `src/components`, then `@lobehub/ui/base-ui`, then `@lobehub/ui`, then `antd`.
- If no suitable project or skill component exists, use shadcn/ui as the default fallback and follow the shadcn workflow for installed components, docs, variants, composition, and aliases.
- Prefer extending an existing component with a documented variant over creating a duplicate.
- Prefer shadcn primitives and composition over bespoke styled markup when adding a missing generic UI primitive.
- New reusable components must be added to the inventory in the same change.
- Deprecated components should stay documented until removed from code.

## State Rules

For interactive components, document expected states:

- Default.
- Hover.
- Focus.
- Active or pressed.
- Disabled.
- Loading.
- Error.
- Empty.

If a component lacks an expected state, record that intentionally.
