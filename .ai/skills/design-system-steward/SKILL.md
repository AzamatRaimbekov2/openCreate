---
name: design-system-steward
description: Use when creating, auditing, updating, or enforcing a project design system for web frontends or mobile apps, especially docs/frontend/design.md, docs/frontend/design-system.md, docs/mobile/design.md, color palettes, UI tokens, typography, spacing, components, accessibility, themes, responsive/adaptive behavior, or design governance.
---

# Design System Steward

## Overview

Maintain a durable design-system source of truth for product UI across web and mobile. The core deliverable is a filled `design.md` that explains not only token values, but why they exist, when to use each palette or component pattern, and how future UI work must stay consistent.

## Startup

1. Read project memory first: `docs/wiki/index.md`, `docs/wiki/schema.md`, recent `docs/wiki/log.md`, relevant `FEATURE.md` files, and existing UI docs such as `docs/frontend/README.md`, `design-system.md`, `components.md`, `screens.md`, `ui-decisions.md`, and `audit-checklist.md`.
2. Locate the canonical design document:
   - Use existing `docs/frontend/design.md`, `docs/mobile/design.md`, or `docs/design.md` if present.
   - For web/frontend projects, create `docs/frontend/design.md` when missing.
   - For mobile-only projects, create `docs/mobile/design.md` when missing.
   - For cross-platform products, create `docs/design.md` and link platform-specific docs from it.
3. Treat existing `design-system.md` files as compact token ledgers. Keep them synced with `design.md`, but make `design.md` the richer narrative specification.
4. Inspect actual sources before writing claims: theme config, CSS variables, Tailwind config, native mobile theme files, UI components, route/screen docs, assets, icons, screenshots, and product copy.

## Design Document Contract

When creating or updating `design.md`, include the sections from `references/design-md-template.md` unless the project already has a better equivalent. Fill unknowns as `TBD` with the evidence needed to resolve them; do not invent brand facts.

Minimum required coverage:

- Product design intent, audience, supported platforms, and UI principles.
- Color palettes with token names, values, roles, contrast notes, and explicit "use when / avoid when" guidance.
- Typography, spacing, layout density, breakpoints, adaptive behavior, mobile safe areas, and platform differences.
- Shape, radius, borders, elevation, shadows, motion, iconography, imagery, components, interaction states, accessibility, dark mode, and theming rules.
- Governance rules for adding tokens, components, screens, and exceptions.

## Palette Rules

Every color entry must explain its job. Do not leave colors as unlabeled hex values.

| Palette | Use When | Avoid When |
| --- | --- | --- |
| Primary | Main brand actions, active navigation, selected states, high-confidence CTAs. | Decorative backgrounds, repeated status colors, dense data tables where it competes with content. |
| Secondary or accent | Highlights, supporting actions, illustrations, onboarding emphasis, occasional empty states. | Critical status, destructive actions, or large surfaces that make the product feel one-note. |
| Neutral | App structure, surfaces, borders, text hierarchy, disabled states, quiet operational screens. | Communicating semantic state by itself. |
| Success, warning, danger, info | Feedback, validation, alerts, risk, progress, and system status. | Branding, decoration, or non-status emphasis. |
| Brand or marketing | Public pages, hero moments, campaign surfaces, product identity. | Repeated operational workflows where clarity and scan speed matter more than expression. |
| Dark mode | Low-light use, media-heavy workflows, or user-selected dark theme. | As a default without checking contrast, elevation, and semantic status colors separately. |

## Workflow

1. Audit existing docs and UI implementation for drift.
2. Create or update `design.md` from evidence.
3. Reconcile compact docs: update `design-system.md`, `components.md`, `screens.md`, and `ui-decisions.md` when design rules, components, or screen behavior changed.
4. For new UI work, choose tokens and components from `design.md` first. Add new tokens only when existing roles cannot serve the product need.
5. Record exceptions with a reason, owner, and review trigger.
6. Before completion, verify the design docs answer: what exists, why it exists, when to use it, when not to use it, and how to extend it safely.

## Quality Bar

- Design rules must be specific enough for another agent to build a new screen without rediscovering the visual system.
- Mobile notes must cover touch target size, safe areas, density, navigation patterns, platform conventions, and light/dark behavior when relevant.
- Accessibility must include contrast, focus/pressed states, reduced motion, text scaling, color-independent status, and minimum tappable targets.
- If implementation and docs disagree, fix the implementation or update docs in the same task.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Writing only token tables | Add intent, usage rules, examples, and anti-patterns. |
| Describing colors as "blue" or "purple" | Name semantic roles such as `color-action-primary` or `surface-warning-soft`. |
| Treating mobile as a smaller web page | Document safe areas, gestures, native controls, density, haptics, and platform-specific navigation. |
| Adding a new palette for one screen | Try existing semantic tokens first; document a new palette only if it supports a repeated product need. |
| Updating `design.md` but not component docs | Sync affected component, screen, and decision docs before finishing. |
