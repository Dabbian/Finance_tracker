# Personal Finance — Design System (Master)

Source of truth. Page-specific overrides live in `design-system/pages/`.

## Direction

Warm & friendly fintech. Cream + terracotta + sage green. Soft, rounded,
approachable. Designed to be opened daily without feeling cold or sterile.
Light + dark themes (user-toggled, with a switch in the topbar/settings).

## Typography

- **Display:** Varela Round (h1–h3, big numbers, brand)
- **Body / UI:** Nunito Sans (300/400/500/600/700)
- **Numerals:** all money/tabular contexts use `font-variant-numeric: tabular-nums`

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Varela+Round&display=swap');
```

Type scale (rem, base 16px): 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 2 / 2.5 / 3
Line-height: 1.5 body, 1.2 display. Body weight 400, labels 500, headings 600–700.

## Color Tokens

This codebase uses its own token convention — keep using it, don't rename:

- `--primary` = darkest **text/heading** color (not brand)
- `--secondary` = secondary heading/text color
- `--accent` / `--accent-light` = **brand** (terracotta)
- `--success` = income / positive (sage green)
- `--danger` = expense / negative (warm red)
- `--warning` = warm amber
- `--text` / `--text-light` = body text + muted body
- `--bg` / `--bg-alt` = page background + subtle fills (cards use white in light, `--bg-alt` works as muted)
- `--surface` = card surface (white in light, stone-800 in dark)
- `--border` = hairline
- `--header-from` / `--header-to` = top header gradient stops

The "warm & friendly" palette lives in `[data-palette="earth"]` (default).

### Earth — Light (default)

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#FFFBEB` | warm cream |
| `--bg-alt` | `#F5EFE6` | muted fills |
| `--surface` | `#FFFFFF` | card surface |
| `--text` / `--primary` | `#1C1917` | warm near-black (stone-900) |
| `--text-light` | `#78716C` | stone-500 |
| `--secondary` | `#44403C` | stone-700 |
| `--border` | `#EFE4D7` | warm hairline |
| `--accent` | `#9A3412` | terracotta |
| `--accent-light` | `#C2410C` | hover/lighter |
| `--success` | `#15803D` | sage green-700 (income) |
| `--warning` | `#B45309` | warm amber |
| `--danger` | `#B91C1C` | warm red (expense) |
| `--header-from`/`--header-to` | `#FFFBEB` → `#F5EFE6` | tonal, not stark |
| `--shadow` | `0 1px 2px rgba(28,25,23,.06)` | warm-tinted, not pure black |
| `--shadow-lg` | `0 8px 24px rgba(28,25,23,.08), 0 2px 6px rgba(28,25,23,.04)` | |

### Earth — Dark

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#1C1917` | warm stone-900 (NOT pure black) |
| `--bg-alt` | `#292524` | stone-800 |
| `--surface` | `#292524` | card surface |
| `--text` / `--primary` | `#FAF7F2` | warm white |
| `--text-light` | `#A8A29E` | stone-400 |
| `--secondary` | `#D6D3D1` | |
| `--border` | `rgba(255,255,255,0.08)` | |
| `--accent` | `#EA8B6B` | softer terracotta for dark |
| `--accent-light` | `#F2A488` | |
| `--success` | `#4ADE80` | green-400 (income) |
| `--warning` | `#FBBF24` | |
| `--danger` | `#F87171` | red-400 (expense) |
| `--header-from`/`--header-to` | `#1C1917` → `#292524` | |

Other palettes (slate, mint, forest, plum, sunset, mono, ocean, blossom, honey)
are kept as alternative options users can switch to in Settings → Appearance,
but the **warm/friendly direction is canonical** — new components should look
right against earth first.

Both modes verified for ≥4.5:1 body / ≥3:1 large text contrast.

## Shape (Pillowy)

- `--radius-sm`: 10px (inputs, small chips)
- `--radius-md`: 14px (buttons)
- `--radius-lg`: 20px / 22px (cards, sheets)
- `--radius-xl`: 28px (hero/big modals)
- `--radius-full`: 9999px (pills, avatars)

Concretely in CSS the radii ladder is: 10 / 14 / 16 / 18 / 20 / 22 / 28px.
Pills `999px` and tiny indicators (2–4px) stay as-is.

## Elevation (warm-tinted, not pure black)

```css
--shadow:    0 1px 2px rgba(28,25,23,0.06);
--shadow-lg: 0 8px 24px rgba(28,25,23,0.08), 0 2px 6px rgba(28,25,23,0.04);
```

Dark mode: same opacities, shadows are barely visible — rely more on `--surface`
contrast and borders.

## Spacing

4/8 system: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64. Use for padding,
gaps, section spacing. Card inner padding 16–20px (mobile) / 24px (desktop).

## Motion

- Micro-interactions: 150–200ms, ease-out
- State transitions (modal/sheet): 220–280ms, spring-like
- Theme switch: 200ms cross-fade on `background-color` and `color` only
- Respect `prefers-reduced-motion`: drop to 0ms duration, keep opacity changes

## Components

### Buttons
Primary: `--accent` bg, white fg, `--radius-md`, 12px×20px padding, weight 600.
Hover: warm-tinted box-shadow via `color-mix(var(--accent) 28%, transparent)`.
Pressed: translateY(0).
Secondary: `--bg-alt` bg + `--border`. Ghost: transparent + hover `--bg-alt`.
Destructive: `--danger` bg.

### Cards
`--surface` bg, `--radius-lg` (22px), `--shadow-lg`, 1px `--border`.

### Inputs
`--radius-md` (14px), 2px `--border`, 12px×16px padding, 16px text (prevents
iOS zoom). Focus: 3px `--accent` color-mix ring at 18%.

### Money values
Always `tabular-nums`. Convention used in this app:

- **Default / expense in lists** → `--text` (neutral). The sign or row
  context carries direction; coloring every expense red creates alarm fatigue.
- **Income** → `--success` (green). Highlighted because it's the rarer event.
- **Red (`--danger`)** → reserved for *warnings* (over-budget, negative net
  worth, destructive actions) — not for routine expenses.
- **Amber (`--warning`)** → caution states (approaching limit, partial).
- Never tint money values with category color. Category badges/dots use
  category color; the number itself stays in the semantic palette above.

### Category badges
Warm tinted bg using `color-mix(var(--cat-color) 16%, transparent)` with
`--cat-color` as text color. 6px dot prefix in `--cat-color`. Pill-shaped
(`border-radius: 999px`), uppercase, weight 700.

## Iconography

Lucide-style line icons. 1.5–1.75px stroke. Size tokens: 16 / 20 / 24 / 32.
No emoji as functional icons. Consistent style — don't mix outline + filled
in same row.

## Accessibility (must)

- Contrast: body ≥4.5:1, large/UI ≥3:1, both themes
- Focus visible everywhere keyboard reaches (≥2px ring, never `outline:none` alone)
- Touch targets ≥44×44px; expand hit area with padding when icon is smaller
- `prefers-reduced-motion` respected
- Money/state never conveyed by color alone — pair with sign (+/−) or icon
- Form errors near field, with text (not just red border)

## Anti-patterns (avoid)

- Pure white `#FFFFFF` page background (use cream `--bg`)
- Pure black `#000000` dark mode (use warm stone `--bg`)
- Cold pure-gray neutrals (use stone-/warm-tinted neutrals)
- Emoji as icons
- Money color tied to category instead of direction
- Heavy multi-color shadows; sharp 90° corners; cramped spacing
- Hardcoded `rgba(59,130,246,…)` (old slate-blue accent) anywhere — use
  `color-mix(in srgb, var(--accent) X%, transparent)` for theme-aware tints
