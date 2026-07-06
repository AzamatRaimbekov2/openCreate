# Frontend Audit Checklist

Use this checklist before calling frontend work complete.

## Documentation

- `docs/frontend/design-system.md` updated for new colors, fonts, spacing, radii, shadows, motion, or breakpoints.
- `docs/frontend/design.md` updated for palette intent, token usage rules, platform/mobile notes, accessibility, and design governance when the design system changes.
- `docs/frontend/components.md` updated for new, changed, deprecated, or removed components.
- `docs/frontend/screens.md` updated for new or changed routes, pages, or major layouts.
- `docs/frontend/ui-decisions.md` updated for meaningful visual or system decisions.

## Component Quality

- Existing components and tokens were reused where practical.
- New components are named clearly and documented.
- Interactive states are handled or explicitly deferred.
- Component text fits at desktop and mobile sizes.
- No nested card pattern unless semantically necessary.

## Visual Quality

- Typography matches the documented direction.
- Colors use documented roles and have sufficient contrast.
- Spacing and alignment are intentional.
- No accidental overlap, clipped text, or horizontal overflow.
- Motion supports interaction or the visual concept.

## Responsive QA

- Desktop checked when practical.
- Mobile checked when practical.
- Navigation, controls, and content remain usable.
- Fixed-format UI has stable dimensions.

## Runtime QA

- Local page or app opened when practical.
- Console errors checked when practical.
- Unknown route renders the project 404 page.
- Blocking failures can render the documented error modal/dialog pattern.
- Crash or render failure path renders a root-level fallback instead of a white screen.
- Offline browser state renders a blocking no-internet overlay/modal and clears when connection returns.
- Obvious visual issues fixed before final response.
