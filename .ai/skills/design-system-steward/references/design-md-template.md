# Design System Document Template

Use this template when creating or refreshing a project `design.md`. Keep headings that apply; mark unknown facts as `TBD` with the evidence needed to resolve them.

```md
# Design System

Last updated: YYYY-MM-DD
Status: draft | current | needs-review
Platforms: web | iOS | Android | cross-platform

## Purpose

- Product:
- Primary users:
- Experience goals:
- Design principles:
- Source files:

## Platform Coverage

| Platform | Scope | Notes |
| --- | --- | --- |
| Web |  |  |
| iOS |  |  |
| Android |  |  |

## Visual Direction

Describe the intended product feel in concrete terms. Include what the UI should optimize for: speed, trust, calm scanning, editorial impact, playful interaction, dense operations, accessibility, or another product-specific quality.

## Color System

### Palette Intent

| Palette | Purpose | Use When | Avoid When |
| --- | --- | --- | --- |
| Primary |  |  |  |
| Secondary |  |  |  |
| Accent |  |  |  |
| Neutral |  |  |  |
| Success |  |  |  |
| Warning |  |  |  |
| Danger |  |  |  |
| Info |  |  |  |
| Dark mode |  |  |  |

### Tokens

| Token | Value | Role | Pairings | Contrast | Platforms |
| --- | --- | --- | --- | --- | --- |
| `color-text-primary` |  | Primary readable text |  |  | web/iOS/Android |
| `color-surface-base` |  | App background |  |  | web/iOS/Android |
| `color-action-primary` |  | Main action |  |  | web/iOS/Android |

### Color Rules

- Primary action color:
- Secondary action color:
- Link color:
- Focus color:
- Selection color:
- Disabled color:
- Error color:
- Empty-state color:
- Data visualization colors:
- Dark mode adjustments:

## Typography

| Token | Font | Size | Weight | Line Height | Usage | Platforms |
| --- | --- | --- | --- | --- | --- | --- |
| `type-display` |  |  |  |  |  |  |
| `type-title` |  |  |  |  |  |  |
| `type-body` |  |  |  |  |  |  |
| `type-label` |  |  |  |  |  |  |

Rules:

- Heading hierarchy:
- Body text:
- Labels and controls:
- Numeric/tabular data:
- Mobile dynamic type/text scaling:
- Fallback fonts:

## Spacing and Layout

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` |  |  |
| `space-2` |  |  |
| `space-3` |  |  |
| `space-4` |  |  |

Rules:

- Page margins:
- Section rhythm:
- Component padding:
- Dense operational views:
- Touch target minimum:
- iOS/Android safe area behavior:
- Grid and list density:

## Shape, Borders, and Elevation

| Token | Value | Usage |
| --- | --- | --- |
| `radius-control` |  |  |
| `radius-surface` |  |  |
| `border-subtle` |  |  |
| `shadow-raised` |  |  |

Rules:

- Radius:
- Borders:
- Shadows/elevation:
- Card usage:
- Modal/sheet elevation:
- Mobile bottom sheets:

## Components

| Component | Purpose | Variants | States | Tokens | Accessibility |
| --- | --- | --- | --- | --- | --- |
| Button |  |  | default, hover, focus, pressed, disabled, loading |  |  |
| Input |  |  | default, focus, error, disabled |  |  |
| Dialog/Modal |  |  | open, closing, error |  |  |
| Toast/Alert |  |  | success, warning, error, info |  |  |
| Navigation |  |  | active, collapsed, mobile |  |  |

Rules:

- Reuse priority:
- Button hierarchy:
- Form behavior:
- Error messaging:
- Empty/loading states:
- Offline/no-internet behavior:
- Mobile navigation:

## Motion and Feedback

| Pattern | Duration | Easing | Use When | Avoid When |
| --- | --- | --- | --- | --- |
| Micro interaction |  |  |  |  |
| Page transition |  |  |  |  |
| Loading skeleton |  |  |  |  |

Rules:

- Reduced motion:
- Loading feedback:
- Validation feedback:
- Mobile haptics:
- Gesture feedback:

## Responsive and Adaptive Behavior

| Breakpoint or Class | Target | Layout Rule |
| --- | --- | --- |
| Mobile |  |  |
| Tablet |  |  |
| Desktop |  |  |
| Wide |  |  |

Rules:

- Navigation changes:
- Content stacking:
- Tables and dense data:
- Forms:
- Touch vs pointer:
- Keyboard and screen reader behavior:

## Accessibility

- Contrast requirements:
- Focus indicators:
- Color-independent state:
- Text scaling:
- Screen reader names:
- Keyboard navigation:
- Touch targets:
- Motion sensitivity:
- Error recovery:

## Assets, Icons, and Imagery

- Icon style:
- Illustration style:
- Photo/image rules:
- Empty-state imagery:
- App icons and favicons:
- Asset naming:

## Theming and Modes

- Light mode:
- Dark mode:
- High contrast:
- Brand/tenant themes:
- Seasonal/campaign themes:
- How themes are implemented:

## Governance

Before adding a token, component, theme, or palette:

1. Search this document and compact token docs.
2. Reuse an existing semantic role when possible.
3. Add a new token only for a repeated product need.
4. Document value, purpose, use cases, anti-patterns, accessibility, and platform coverage.
5. Update component and screen docs if behavior or structure changed.
6. Record meaningful decisions in `ui-decisions.md` or the project wiki.

## Open Questions

-
```
