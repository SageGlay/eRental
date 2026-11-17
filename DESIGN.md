---
version: alpha
name: eRental
description: Familiar rental cards and clear private review forms for Iligan City.
colors:
  primary: '#0f766e'
  primary-dark: '#115e59'
  primary-soft: '#e6f4f2'
  accent: '#f59e0b'
  focus: '#1d4ed8'
  background: '#ffffff'
  surface: '#f8fafc'
  border: '#e2e8f0'
  text: '#0f172a'
  muted: '#475569'
  danger-text: '#991b1b'
  scrollbar-thumb: '#94a3b8'
  scrollbar-hover: '#64748b'
  overlay: 'rgba(15, 23, 42, 0.5)'
typography:
  sans:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    lineHeight: '1.6'
rounded:
  DEFAULT: '8px'
  sm: '8px'
  md: '12px'
  lg: '20px'
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

# eRental design context

## Overview

The existing application is the reference: a local rental noticeboard with teal actions, white/slate cards and direct instructions. Preserve that identity rather than creating a separate brand for verification. The signature remains the teal marketplace mark and calm, clearly labelled rental cards. Private identity review should feel like a careful account task, not a promotional landing page or analytics dashboard.

The audience is renters, individual owners, businesses and administrators in Iligan City, Philippines. The UI is English and existing currency/date formatting uses en-PH. No Japanese-market or new localization behavior is introduced. The marketing homepage and authenticated product share the same identity; task clarity and mobile/keyboard operation govern forms and moderation.

**Runtime ownership:** `src/styles/tokens.css` is canonical. This file documents its values; it does not generate CSS. Color names map to matching `--name` properties except background → `--bg`. Scrollbar track aliases `--surface`; active thumb uses `--muted`. Type maps to `--font`, shape to `--r-sm/md/lg`, and spacing to `--s1` through `--s8`. Verification styles consume those properties. Change both runtime values and this record when deliberately evolving the system.

## Colors

Teal is the primary action and approved verification badge color. White and pale slate distinguish surfaces; text remains dark slate. Amber notices explain consequences, and existing error classes use dark red text. Status meaning is also written in text. Global scrollbar thumb/track/hover states stay visible and defer to system colors in forced-color mode.

This app currently has a light theme. Do not imply a supported dark theme or introduce private-document information into decorative backgrounds.

## Typography

Reuse Inter with the existing system fallbacks, body line height and heading weights. Account verification uses restrained page headings and the existing form label/body styles. Native controls remain labelled; legal and privacy instructions use readable text rather than icon-only hints. Format dates/currency with existing helpers.

## Layout

Preserve the 1120px content container, existing spacing rhythm and mobile-first layout. Verification status/form becomes two columns at 900px; admin records become a table at 900px and cards below it. Both representations preserve the same permitted actions. Review dialogs are bounded by the viewport, scroll internally and retain reachable close/confirmation controls.

## Elevation & Depth

Use existing card borders and subtle shared shadow. Native modal dialogs occupy the browser's top layer above sticky navigation, with the tokenized overlay. Avoid new arbitrary z-index stacks or marketing gradients.

## Shapes

Use the existing 8/12/20px radius family: controls and badges small, cards medium, dialog large. Keep document previews rectangular and contained; do not crop evidence needed for review.

## Components

Reuse `.btn`, `.field`, `.form-error`, `.form-success`, `LoadError`, `EmptyState`, route guards and formatting helpers. `VerifiedBadge` is the single verification badge owner. `Dialog` owns modal focus/Escape/inert behavior, while `VerificationDocument` owns authenticated, transient private viewing. Native selects/file pickers are intentional platform controls; their popup geometry is not authored.

Busy primary form actions retain full width; disabled controls cannot submit. Confirmations name the action/applicant, begin with the safe Go back action, and preserve the note on failure. A successful review closes the dialog and focuses the stable queue heading. Do not substitute browser confirm/alert for these controls.

Motion remains subtle and uses existing reduced-motion suppression. Product language stays direct: Pending, Approved, Rejected, Submit verification request, Approve, Reject. A verified badge is evidence of the configured account review, never a guarantee about listings or item condition.

## Do's and Don'ts

- Reuse established tokens and controls; preserve marketplace routes and business behavior.
- Keep private documents out of public profile/listing views and URLs.
- Use textual labels alongside status color and clear recovery after failure.
- Do not add unrelated navigation redesigns, export controls, payments or artificial metrics.
- Do not infer verified status from a submitted form, an old approved request or a client-editable profile value.
