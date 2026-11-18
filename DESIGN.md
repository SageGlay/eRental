---
name: eRental 3.0
description: A local rental marketplace in Iligan City, Philippines.
---

# eRental 3.0 design system

## The handover tag

The mark is a pair of offset, punched equipment tags pointing in opposite directions. Seen together they describe an item changing hands. A slanted, close-set wordmark accompanies the mark at full size. The compact icon uses the same silhouette and holes. The brand lives in navigation and editorial discovery. Working screens reserve the strong accent for an action or selection.

A uniform grid of framed cards made the previous inventory, forms and operational queues look alike. The new layout gives visitors a photographic counter at discovery, owners an indexed editor, and administrators a compact queue. An editorial still life sets the subject on the homepage. Actual inventory photos, prices, reviews and identities always come from marketplace data.

## Palette and runtime ownership

| Primitive | Hex | Role |
| --- | --- | --- |
| Palladian | #EEE9DF | Light page canvas, warm paper |
| Oatmeal | #C9C1B1 | Secondary surface and divider |
| Burning Flame | #FFB162 | Action, active detail, tag |
| Truffle Trouble | #A35139 | Warm emphasis on light paper |
| Blue Fantastic | #2C3B4D | Navigation, strong surfaces, light-mode ink |
| Abyssal Anchorfish Blue | #1B2632 | Dark canvas and text on flame |

`src/styles/tokens.css` owns runtime values. Components consume its semantic roles. `--action` and `--on-action` form the flame action pair. `--primary` supplies a text-safe accent on ordinary surfaces. Navigation and footer carry their own foreground, muted, focus and border roles. Status colors accompany words. Input edges and focus use higher contrast than decorative rules. Brand SVG and favicon use the two authorized brand inks.

## Type, shape and rhythm

Bricolage Grotesque supplies headings and the wordmark. DM Sans supplies readable forms, messages, prices and metadata. Both variable fonts are bundled locally and use swap. Headings use tight tracking and compact leading. Data comparisons use tabular numerals. Body copy starts at 16px. Use a four-pixel spacing base, 44px primary controls, 8px control corners, 12px content corners and 20px dialogs. Photography has a stable aspect ratio and a visible fallback. Inventory rows share dividers rather than nested panels.

## Components and accessibility

Brand and Icon own the symbol and line icons. PageHeading, EmptyState, LoadError, Dialog, ListingSkeleton, ThemeControl and semantic form/button styles are shared. Distinguish loading, a confirmed empty result, access denial and request failure. All dialogs use native modal behavior, a visible safe exit and focus recovery. Touch navigation accounts for device safe areas. Keep focus rings visible on paper and navy, preserve labels and native control semantics, and honor reduced motion and forced colors.

Light and dark use the same content hierarchy. System follows the operating system, and the saved override is read before React initialization. Responsive compositions are checked at 320, 390, 768, 1024 and 1440px. [Workflow ownership and security](UX-CONTRACT.md)
