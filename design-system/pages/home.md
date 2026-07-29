# Home (Dashboard) — design override

Source: UI/UX Pro Max Soft UI + productivity SaaS tokens; 21st.dev KPI card patterns.

## Scope

Visual/layout only. Do **not** change hooks, filters, KPI formulas, charts data, export, or leadership gates.

## Direction

- **Typography:** Plus Jakarta Sans (body + display), DM Mono for numbers
- **Palette:** Teal Soft UI primary (`#0D9488`), cool mint background — replaces indigo/cream
- **Layout:** Compact KPI tone cards, filter toolbar, quieter card-premium, no emoji medals
- **Charts:** Use CSS vars (`--primary`, `--success`) not hard-coded indigo
- **Motion:** 150–200ms hovers; respect reduced motion

## Checklist

- [x] Logic paths unchanged
- [x] First viewport: greeting + filters + KPIs (quote demoted)
- [x] No emoji icons / medals
- [x] cursor-pointer on interactive controls
