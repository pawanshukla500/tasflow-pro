# Brand logo — theme-aware glass chip

## Asset
- Primary mark: `/youthnic-logo.png` (+ `.webp`) — dark monochrome silhouette
- Component: `src/components/BrandLogo.tsx`

## Style (matches inspect glass chip)
- Box: `h-10 w-10 rounded-xl` + soft glass ring
- Mark: `h-6 w-6 object-contain`
- Light: black mark (`brightness-0`) on `bg-black/4` ring
- Dark / brand panel: white mark (`brightness-0 invert`) on `bg-white/10` ring

## Surfaces
| Surface | tone |
|---------|------|
| Sidebar, mobile header, loading, login form | `auto` |
| Teal brand panel (Login / AuthShell) | `onBrand` |

## Do not
- Hard-code white SVG wordmarks on light UI
- Use purple/indigo decorative logo fills
