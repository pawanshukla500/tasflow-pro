# Team page — design override

Source: UI/UX Pro Max (Data-Dense Dashboard + Swiss Modernism 2.0), aligned to TaskFlow Pro tokens.

## Scope

Visual/layout only. Do **not** change fetch, filters, roles, CRUD, CSV export, or access checks.

## Direction

- **Style:** Data-dense directory — compact KPI strip, semantic table, sticky toolbar.
- **Typography:** Keep Manrope + Plus Jakarta Sans + DM Mono (app-wide).
- **Palette:** Keep existing CSS variables (`--primary` indigo). Soften role chips; status via success/warning/destructive tokens.
- **Layout:** `max-w-6xl`, KPI strip (not 4 heavy cards), filter toolbar, shadcn `Table` with header row.
- **Motion:** Subtle row hover (150–200ms); respect `prefers-reduced-motion` via existing utilities.
- **Avoid:** Extra card chrome, emoji icons, purple-on-white landing tropes beyond brand primary, dark-mode-only redesign.

## Checklist

- [ ] Logic paths unchanged (create/edit/delete/reset/export/filters)
- [ ] Role badges readable (WCAG AA)
- [ ] Mobile: filters wrap; table scrolls horizontally
- [ ] Actions menu always reachable (not hover-only on touch)
