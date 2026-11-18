---
version: alpha
name: eRental 2.0
description: A warm, photo-led local rental marketplace for Iligan City.
colors:
  green-velvet: '#29281e'
  golden-sandalwood: '#857861'
  almond-light: '#e7d4bb'
  plum-wine: '#48252f'
  carbon-powder: '#101211'
  primary: '#48252f'
  primary-dark: '#311820'
  primary-soft: '#f0e5e8'
  on-primary: '#fff8ef'
  background: '#faf7f2'
  surface: '#f0ebe3'
  surface-elevated: '#fffdf9'
  text: '#101211'
  muted: '#645b50'
  border: '#ddd5c9'
  input-border: '#8a8175'
  focus: '#78445a'
  success-text: '#28542d'
  success-bg: '#e7efe6'
  warning-text: '#684b13'
  warning-bg: '#f6ecd4'
  danger-text: '#912f2b'
  danger-bg: '#f7e9e6'
typography:
  sans:
    fontFamily: 'Manrope Variable, system-ui, -apple-system, Segoe UI, sans-serif'
    lineHeight: '1.65'
  display:
    fontFamily: 'DM Sans Variable, Manrope Variable, system-ui, sans-serif'
    lineHeight: '1.15'
rounded:
  DEFAULT: '12px'
  sm: '12px'
  md: '20px'
  lg: '28px'
spacing:
  s1: '0.25rem'
  s2: '0.5rem'
  s3: '0.75rem'
  s4: '1rem'
  s5: '1.5rem'
  s6: '2rem'
  s7: '3rem'
  s8: '4.5rem'
components:
  button:
    height: '44px'
  dialog:
    width: '680px'
---

# eRental 2.0 design context

## Overview

The approved 2.0 brief replaces the earlier teal, light-only identity across the existing React marketplace. The audience is renters, owners, businesses and administrators in Iligan City, Philippines. English copy, en-PH dates/currency and Philippine pesos remain. One account can rent and list. This is a hybrid: discovery is expressive; account, booking and moderation screens prioritize familiar, careful actions.

The signature is an original open-loop mark: two interlocking door-shaped paths suggesting something passing from one person to another. Rounded photography, warm paper surfaces, plum actions and a compact wordmark support this idea. The boldest composition belongs to the homepage, where a real listing photo can become the hero preview. When no photo exists, a clearly decorative icon collection appears. Never create invented inventory, reviews, guarantees or activity.

**Runtime ownership (model B):** `src/styles/tokens.css` is canonical; this file mirrors accepted values and rationale. Primitive palette → semantic variables → shared CSS/components → page styles. Colors map to `--name`, except background → `--bg`; typography maps to `--font` and `--font-display`; radii to `--r-sm/md/lg`; spacing to `--s1..s8`. Components must consume semantic colors. Static SVG brand assets intentionally use the approved primitive palette. No generated adapter or second theme package exists.

## Colors

Green Velvet #29281E, Golden Sandalwood #857861, Almond Light #E7D4BB, Plum Wine #48252F and Carbon Powder #101211 are the approved primitives. Sandalwood is decorative/supporting, not small body text on pale backgrounds. Derived warm neutrals provide readable content surfaces. Plum is the light-mode action; almond is the dark-mode action. Semantic success/warning/error colors always accompany text labels.

| Role / runtime token | Light | Dark |
| --- | --- | --- |
| `--bg` | #faf7f2 | #101211 |
| `--surface` | #f0ebe3 | #1c1f1b |
| `--surface-elevated` | #fffdf9 | #252820 |
| `--text` | #101211 | #f5ede2 |
| `--muted` | #645b50 | #c2b6a6 |
| `--primary` | #48252f | #e7d4bb |
| `--primary-dark` (hover) | #311820 | #f6e7d4 |
| `--primary-soft` | #f0e5e8 | #382b31 |
| `--on-primary` | #fff8ef | #29281e |
| `--border` | #ddd5c9 | #494b40 |
| `--input-border` | #8a8175 | #8d8d7d |
| `--focus` | #78445a | #e4b4ca |
| `--hero-bg` / `--hero-text` | #e7d4bb / #29281e | #29281e / #e7d4bb |

All remaining alert, input, disabled, footer, overlay, scrollbar and shadow roles are maintained in the same runtime file, including dark overrides. Soft dividers are decorative; input borders and focus rings provide stronger control boundaries. Do not put elevated light-mode colors directly in component CSS.

## Typography

Manrope Variable supplies the readable body and utility voice; DM Sans Variable supplies slightly tighter, distinctive display headings and wordmark. Two self-hosted Latin WOFF2 faces total about 62 kB, avoid an external Google Fonts request and use swap/system fallbacks. English is the supported UI language; broader script font coverage is outside this milestone. Headings use fluid 32–52px page type, 24–36px section type and 18px card titles; body is 16px with 1.65 leading. Compact metadata may use 12–14px where secondary. Primary tasks never rely on tiny type.

## Layout

The shared container is 1320px with 16px phone / 32px larger gutters. Spacing uses a 4px base. Cards use larger, consistently cropped photography; compact information and actual rates permit comparison. Browse uses a desktop filter sidebar and a mobile disclosure. Auth uses a story/form split; listing forms use grouped sections and a guidance rail. Renter/owner views remain equally accessible, and native selects/date inputs intentionally retain platform popup behavior.

Navigation becomes a compact desktop header above 1200px and a purpose-built disclosure below it, with the theme selector always reachable. Account links live in a native disclosure, with Escape/outside-close behavior. Mobile does not shrink a full desktop link row. Pages scroll naturally; only dialogues and appropriate message regions own internal overflow. Admin verification uses table/cards at its existing breakpoint.

## Elevation & Depth

Elevated content uses restrained warm shadows, borders and surface changes. Native modal dialogs use the browser top layer and a tokenized backdrop. No decorative gradients, glass effects, animation packages, charts or fake analytics are needed. Private evidence remains contained and uncropped when viewed.

## Shapes

Controls use 12px, cards 20px and larger framed regions/dialogs 28px radii. Pills are reserved for statuses and selected controls. The open-loop mark stays recognizable at favicon scale; all SVG utility icons share one 24px viewbox, currentColor and 1.6px rounded strokes.

## Components

`Brand`, `Icon`, `PageHeading`, `ListingSkeleton`, `ThemeControl` and `UnsavedChangesGuard` join existing `Dialog`, `VerifiedBadge`, `VerificationDocument`, `LoadError`, `EmptyState`, `.btn` and `.field`. Page CSS supplies composition; shared tokens and primitives supply color and interaction conventions. Buttons have default/primary/ghost/danger emphasis, hover, focus, active and disabled states. Forms retain owned validation, data recovery and labels. Textareas do not resize manually; adequate height and content sizing allow expansion.

Skeletons are used for real loading, per this brief. Errors retain truthful recovery, never fake results. Dialogs remain keyboard accessible, with safe initial close/back controls, bounded content and focus restoration. Significant booking and moderation decisions use explicit confirmation. Status colors do not replace status words. Global scrollbars remain visible, tokenized and operable in forced-color mode. Motion is restrained and suppressed under reduced-motion preference.

## Do's and Don'ts

- Preserve all routes, existing Supabase calls, authorization, retry identity and actual state transitions.
- Support light, dark and system preference across the entire app; keep preference local and apply it before React starts.
- Keep private documents out of public content, durable storage and public URLs.
- Use real photos only where present; show honest missing/broken media states.
- Never imply real payments, instantaneous messaging, inspected listings, guaranteed availability or verification guarantees.
- Do not replace product controls with decorative icons or obscure essential actions on phones.
