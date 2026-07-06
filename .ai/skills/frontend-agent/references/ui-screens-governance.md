# Screens and Layouts

This file records pages, routes, screens, and major layouts.

## Inventory

| Screen or Layout | Path or Route | Purpose | Components | Status |
| --- | --- | --- | --- | --- |
| Frontend Design Demo | `frontend-design-demo.html` | Demonstrates the frontend-design skill and project visual direction | `Topbar`, `HeroPanel`, `ActionButton`, `MetricMeter`, `NotePanel`, `FeatureGrid`, `FeatureTile` | active |

## Screen Documentation Template

Use this template for new screens:

```md
### ScreenName

- Path or route:
- Purpose:
- Primary users:
- Main components:
- Empty/loading/error states:
- Responsive behavior:
- Accessibility notes:
- Status:
```

## Layout Rules

- Real app screens should prioritize usable workflows over marketing filler.
- Page sections should be full-width bands or unframed layouts unless a card is semantically appropriate.
- Major layouts must define how they behave at desktop and mobile widths.
- Every initialized frontend app should document its 404 route, blocking error modal/dialog behavior, crash fallback, and offline no-internet blocker in this file or the nearest feature doc.
- Do not add a new route or major screen without updating this file.
