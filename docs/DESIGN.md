# Arc Spirits Spectate — Design System

Single source of truth for visual + interaction language across `arc-spirits-spectate`.
Brand: **Lantern Light Games — Arc Spirits "Fight for the Arcane Abyss"** (Brand Kit v1.0).
All tokens defined in `src/routes/layout.css`.

---

## Palette

### Abyss backgrounds (use as page/panel surfaces)
| Token | Hex | Use |
|-------|-----|-----|
| `--color-void` | `#050310` | Page background, deepest abyss |
| `--color-obsidian` | `#0a0718` | Sidebar, secondary background |
| `--color-shadow` | `#11091f` | Panels, section backgrounds |
| `--color-crypt` | `#1a0f2e` | Elevated surfaces |
| `--color-tomb` | `#221440` | Cards |
| `--color-mist` | `#2e1d52` | Subtle borders |
| `--color-aether` | `#3a2670` | Bright borders |

### Brand accents
| Token | Hex | Use |
|-------|-----|-----|
| `--brand-magenta` | `#ff2bc7` | Primary accent, CTAs, focus |
| `--brand-violet` | `#7b1dff` | Secondary accent |
| `--brand-cyan` | `#24d4ff` | Active states, focus rings, links |
| `--brand-teal` | `#20e0c1` | Success, completion |
| `--brand-amber` | `#ffba3d` | Warning, attention |
| `--brand-coral` | `#ff704d` | Error accent |

### Text
| Token | Hex | Use |
|-------|-----|-----|
| `--color-bone` | `#f5f0ff` | Primary text |
| `--color-parchment` | `#d8cfee` | Secondary text |
| `--color-fog` | `#9a8fb8` | Muted text |
| `--color-whisper` | `#6a5d8a` | Very muted, hints |

### Gradients
- `--gradient-flame` — magenta → violet → royal (use for hero text via `.brand-flame-text`)
- `--gradient-aurora` — magenta → violet → cyan (decorative, use sparingly)
- `--gradient-haunted` — radial abyss (page backgrounds)

### Glows (one shadow allowed per surface)
- `--glow-cyan` — focus rings, active drag handles
- `--glow-magenta` — primary buttons hover
- `--glow-amber` — warning highlights
- `--glow-teal` — success completion shimmer

---

## Typography

| Role | Font | Size | Weight | Line-height | CSS var |
|------|------|------|--------|-------------|---------|
| Display (page title) | Bebas Neue | 28px | regular | 1.1 | `--font-display` |
| Section eyebrow | Bebas Neue | 11px uppercase, 0.08em letter-spacing | regular | 1.4 | `--font-display` |
| Comp name (list) | Bebas Neue | 14px | regular | 1.3 | `--font-display` |
| Comp name (editor) | Bebas Neue | 24px (brand-flame-text) | regular | 1.2 | `--font-display` |
| Body | Inter | 14px | 400 | 1.5 | `--font-body` |
| Code/numbers | JetBrains Mono | 12px | 400 | 1.4 | `--font-mono` |
| Markdown report | Inter | 14px (mono for code blocks) | 400 | 1.6 | `--font-body` |

**Banned fonts:** `system-ui`, `-apple-system` as primary display/body fonts. The brand kit fonts MUST be used.

---

## Spacing scale

Use Tailwind defaults (`px-2` `py-3` etc.) but standardize on 4px base.

```
4px   8px   12px   16px   24px   32px   48px   64px
```

---

## Border-radius scale

Visual hierarchy via shape — **don't apply uniform radius to everything**.

| Element | Radius |
|---------|--------|
| Pill chips (selected count, comp chip, tag) | `9999px` (full pill) |
| Cards / panels | `8px` |
| Buttons | `6px` |
| Inputs / textareas | `4px` |
| Hexagons | n/a (uses `.hex-clip` polygon) |

---

## Shadow / depth rule

**One shadow allowed per surface: focused-panel cyan glow.** Everything else flat against abyss.

```css
.focused-panel {
  box-shadow: 0 4px 24px rgba(36, 212, 255, 0.08);
}
```

**Banned:** drop shadows for "depth", colored left-borders on cards, decorative shadows.

---

## Motion allowlist

**Only these animations are permitted.** Anything else is forbidden.

| Animation | Duration | Easing | Use |
|-----------|----------|--------|-----|
| Drag (curve points) | 0ms (no anim) | n/a | 60fps via `chart.update('none')` |
| Save indicator pulse | 300ms | ease-out | Green glow on successful save |
| Completion shimmer | 400ms | ease-out | Teal shimmer on game-card when fully tagged |
| Tab change crossfade | 120ms | ease-in-out | Sub-route transition |

**Banned:** hover bounces, page transitions, fade-in stagger, scroll-linked parallax, decorative motion.

**Required:** every animation honors `@media (prefers-reduced-motion: reduce)` — falls back to instant state changes.

---

## Brand utility classes (use these, don't re-implement)

Defined in `src/routes/layout.css`:

| Class | Purpose |
|-------|---------|
| `.brand-panel` | Standard panel — `--color-shadow` background, subtle border |
| `.brand-flame-text` | Magenta→violet→royal gradient text (use for titles) |
| `.btn-flame` | Primary button — magenta gradient fill |
| `.btn-ghost` | Secondary button — cyan stroke |
| `.eyebrow` | Numbered eyebrow label style (`01 · LABEL`) |
| `.hex-clip` | Hexagon clip-path for board cells |

**Required:** every new component MUST use these utilities where they apply. No re-implementing button styles, panel backgrounds, or eyebrow text.

---

## Tailwind class policy

**Use `var(--brand-*)` directly; do NOT use Tailwind color classes** (`bg-purple-*`, `text-cyan-*`, etc).

Even though `layout.css` remaps Tailwind colors to brand tokens, explicit token references survive Tailwind upgrades and remove the "is `bg-purple-900` the right purple?" guesswork.

```html
<!-- ✅ correct -->
<div class="bg-[var(--color-shadow)] text-[var(--color-bone)]">…</div>

<!-- ❌ wrong -->
<div class="bg-purple-900 text-gray-100">…</div>
```

---

## AI-Slop blacklist (binding)

When designing new components, **never** do these:

1. **NO 3-column card grid** with icon + title + 2-line description (the most recognizable AI layout)
2. **NO icons in colored circles** as section decoration (SaaS starter look)
3. **NO centered everything** — workspace UIs are left-aligned
4. **NO uniform bubbly border-radius** on every element (use the scale above)
5. **NO decorative blobs / floating circles / wavy SVG dividers**
6. **NO emoji as design elements** (one exception: 🎉 on the "all caught up" empty state, once)
7. **NO colored left-border on cards** for decoration
8. **NO drop shadows for "depth"** (one shadow allowed: cyan focus glow)
9. **NO purple/violet gradient hero backgrounds** — magenta and violet are accents, not page-fill
10. **NO `system-ui` / `-apple-system`** as the primary display/body font
11. **NO Tailwind default grays** (`gray-100` etc) — use `--color-bone/parchment/fog/whisper`
12. **NO generic "Welcome to X" / "Unlock the power of"** copy — write product-specific words

Reference: [OpenAI "Designing Delightful Frontends" (Mar 2026)](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) + gstack design methodology.

---

## Accessibility (WCAG AA target)

| Aspect | Requirement |
|--------|-------------|
| Contrast | All body text ≥ 4.5:1 against background |
| Color-only signals | Always paired with text label or shape variation (e.g. dash patterns on chart lines) |
| Focus indicators | Cyan glow ring via `:focus-visible` (NOT `:focus`) on every interactive element |
| Keyboard navigation | Tab moves through interactive elements; arrows for grids/sliders; Esc dismisses overlays |
| ARIA landmarks | `<main>`, `<aside>`, `<nav>` present in layout |
| ARIA live regions | Save status: `aria-live="polite"`; errors: `aria-live="assertive"` |
| Reduced motion | All animations gated on `prefers-reduced-motion: reduce` |
| Touch targets | n/a (desktop only ≥1024px) but interactive elements min 32×32 |

---

## Responsive policy

**Desktop-first, ≥1280px target.**

| Viewport | Behavior |
|----------|----------|
| ≥1280px | Full 3-column layout (sidebar + comp list + editor) |
| 1024–1279px | Compressed 3-col, sidebar narrows |
| <1024px | Hard banner: "Composition Analysis lives on the big screen. Switch to a ≥1024px display." App still loads but UI is overlaid. |

---

## Component vocabulary (for the composition-analysis area)

See [composition-analysis-design.md](./composition-analysis-design.md) for the per-component specifications.
