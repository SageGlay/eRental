# eRental 2.0 — Premium Marketplace UI/UX Redesign

Implemented 18 November 2026 on `codex/erental-uiux-redesign`, based on `main` at `3faa279`. This milestone changes the frontend while preserving the existing React/Vite/Router/Supabase architecture, URLs and server contracts. It does not deploy a database migration or change production data.

## Design rationale and brief audit

The previous UI used a single light theme, teal actions, emoji placeholders and mostly identical flat form/card layouts. The signed-in header crowded account actions, browse filters consumed a broad block above results, and hardcoded white/semantic surfaces prevented a coherent dark mode. Listing imagery and task hierarchy needed stronger emphasis. Existing retry, privacy, validation and route-guard mechanisms were valuable and retained.

The new identity uses the five supplied palette primitives: Green Velvet `#29281E`, Golden Sandalwood `#857861`, Almond Light `#E7D4BB`, Plum Wine `#48252F`, and Carbon Powder `#101211`. Derived semantic surfaces, text and alert colors provide readable contrast. An original interlocking open-loop SVG mark suggests items passing between people. Manrope carries body/utility text; DM Sans carries display headings and the wordmark. Photography leads discovery; account and administrative work uses quieter grouping and concise controls.

| Previous design rule / evidence | 2.0 decision | Runtime owner |
| --- | --- | --- |
| Teal and light-only DESIGN.md | Replaced by the explicitly approved earthy palette and two themes | `tokens.css`, `ThemeContext.jsx` |
| Inline email/account/logout actions in Navbar | Compact account disclosure; separate mobile navigation | `Navbar.jsx`, `app.css` |
| Emoji icons and missing-photo glyphs | Shared currentColor SVG family and honest fallback | `Icon.jsx`, `EmptyState.jsx`, listing components |
| Repeated small form cards | Shared heading/control grammar with task-specific compositions | `PageHeading.jsx`, base/auth/page CSS |
| Duplicated raw light and semantic colors | Shared semantic variables in both themes | `tokens.css` |
| Verification-only route splitting | Extended lazy loading to task/detail routes | `App.jsx`, `Layout.jsx` |

The supplied palette reference image itself was not attached in this turn; the exact five color values and written relationships were authoritative. No bathroom/decor layout was inferred.

## Reusable system and themes — Phase A

- Shared `Brand`, `Icon`, `ThemeControl`, `PageHeading`, `ListingSkeleton` and `UnsavedChangesGuard` extend existing `.btn`, `.field`, `Dialog`, `EmptyState`, `LoadError`, `VerifiedBadge` and private-document viewing.
- Native select/date popups remain intentionally platform-owned. No additional UI framework or animation library was added.
- Light, Dark and System options are available in the header on desktop and mobile. Preference persists locally under `erental-theme`; an early script applies the theme before React. System changes and preferences from another tab update the active theme. Storage failure does not prevent using the control.
- All page, card, input, alert, dialog, footer and scrollbar colors map to semantic CSS variables. Both themes retain clear status words and focus indicators. Reduced motion disables decorative animation and transitions.
- Added two dependencies only: `@fontsource-variable/manrope` and `@fontsource-variable/dm-sans`, for self-hosted Latin variable fonts. The two deployed WOFF2 assets total about 62 kB. External Google Fonts requests were removed.

## Page-by-page implementation — Phases B, C and D

| Page / workflow | Actual changes |
| --- | --- |
| Global shell | New SVG identity/favicon, responsive navigation, account disclosure, always-reachable theme selector, grouped footer and route titles. Admin navigation remains role-gated. |
| Home | New split hero, real listing-photo preview or decorative fallback, labeled search, category cards, latest rentals, accurate rental steps, owner CTA and honest verification guidance. No invented testimonials, counts or guarantees. |
| Browse | Desktop filter sidebar, mobile expandable filter/sort controls, visible keyword search, explicit clears, range errors/focus, skeletons and existing Load more/URL/recovery behavior. |
| Listing cards | Larger consistent images, broken/missing-photo fallback, actual category/rate/location and unavailable state; no unsupported favorites or fabricated ratings. |
| Listing details | Photo gallery/arrows/thumbnails, title/metadata, real deposit/rate, clear request/contact panel, owner identity/badge, grouped description/specifications/terms and reviews. Existing availability/date logic remains. |
| Create and edit | Shared grouped listing form, owner guidance, clear photo management and validation. Stable save/photo IDs, partial-save reconciliation, duplicate protection and retry paths remain. Edit still reuses CreateListing. |
| My listings | Larger owner rows/photos, real status filter and chips, booking access, explicit removal confirmation, retained retry and removed-listing rules. |
| Bookings | Renter/owner tabs, real status filter, schedule/history grouping, useful rate/date/payment breakdown, confirmation for accept/decline/cancel/complete and simulated payment. Actual transition rules and payloads remain. |
| Inbox | Recipient/listing/time/unread context, clearer rows, manual refresh and honest periodic-refresh language. |
| Conversation | Recipient/listing context, incoming/outgoing bubbles, actual sent/read state, timestamps, accessible growing composer and retained polling/read-marker/send behavior. |
| Login and registration | Integrated split layout, accurate account guidance, masked password with accessible reveal, associated errors and first-invalid focus. Signup payload/confirmation/session behavior is unchanged. |
| Profile | Account identity/sidebar, individual/business form grouping, protected badge, verification entry, identity-change warning and unsaved-work protection. |
| User verification | Clear account/status/upload/history composition, private-document guidance and file feedback. Upload deadlines, retries, frozen attempts, allowed INSERT fields, deduplication and authoritative badges remain. |
| Admin reports | Unified admin area, open/resolved tabs, readable report/context/notes/history, explicit listing-removal dialog and existing resolution RPC. |
| Admin verification | Cohesive filters/queue/table/mobile cards/status labels, applicant summary and review dialog. URL/paging/PGRST103, RPC, timeout, private-path and focus protections remain. |
| Missing/restricted/loading pages | Shared headings, icons, skeletons/status, clear recovery destinations and retained route checks. |

## Responsive and accessibility work — Phase E

The new browser matrix visits 13 authenticated marketplace/account/admin routes plus login and registration at **320, 390, 768, 1024 and 1440 pixels in both light and dark modes**: 150 route/theme/width combinations. It asserts visible headings and no horizontal document/body overflow; mobile browse options are expanded as well. This is desktop Chromium viewport emulation, not physical-device certification.

- Semantic links/buttons, native labelled controls, explicit status/error announcements, password reveal state and masked defaults.
- Keyboard account/mobile navigation, Escape focus recovery, modal confirmation/inert background and existing private-review focus behavior.
- Shared focus rings, 44px primary controls, associated validation/focus in redesigned auth/profile/listing/filter forms, readable wrapping and reduced-motion support.
- Twelve semantic text/background roles are checked at 4.5:1 or better in each theme. This does not prove every rendered text pair or full WCAG 2.2 AA conformance. Real screen-reader, physical mobile keyboard, browser/platform and full zoom testing remain separate acceptance work.

## Validation

Pre-change baseline: `npm test` **64 passed (43.5s)**; `npm run build` passed, initial JavaScript 481.37 kB.

Final `npm test`: **96/96 passed (1.7 minutes)** — all 64 existing and 32 new tests. Final `npm run build`: passed (152 modules), initial JavaScript **440.82 kB / gzip 127.16 kB**, with no Vite chunk-size warning. The 64 existing behavioral cases remain, with only meaningful selector changes for the account disclosure and newly explicit booking confirmations. The 32 new redesign cases cover the theme/viewport matrix, system changes, persistence, platform theme popup, menus, clears, passwords, unsaved drafts, semantic contrast, reduced motion, menu breakpoint/modal focus, admin-removal feedback/focus and loading/error/empty recovery.

- `audit_project.py --mode strict --no-write`: **zero findings**, including no unresolved canonical owners.
- `designmd lint DESIGN.md`: **zero errors**, 19 informational orphan-token warnings. Runtime CSS is the canonical consumer; this lint does not inspect those CSS references. No threshold or lint rule was relaxed.
- `git diff --check`: passed.
- Initial route splitting removed the intermediate 527 kB warning without changing Vite's threshold. The integrated initial bundle is about **441 kB**, with task-route CSS/JS loaded lazily.
- No new application typecheck/linter script exists. JSX compilation, formatter, strict static UI audit, production bundling and browser checks are the available checks.

Independent review used a separate non-author agent. It exercised a further 96 route/theme/width combinations across 16 routes and confirmed fixes for desktop search geometry, breakpoint focus, admin-action feedback/focus, modal Escape ownership and unselected-star contrast. Final focused rechecks found no remaining concrete findings. Unselected stars measured 5.61:1 in light and 8.35:1 in dark against their surface. This review does not prove live backend behavior or every accessibility criterion. Calibration lived outside the checkout at `/workspace/reports/erental-redesign/calibration/ListingCard.jsx`: an isolated copy displayed a fabricated price instead of `formatRate`. A fresh checker found it. That proves detection of this static mismatch only; it does not prove rendering, all page kinds or authorization. Runtime screenshots and browser checks provide separate evidence.

## Screenshots and visual evidence

Fourteen screenshots are generated by `tests/e2e/redesign.spec.js`: Home, Browse and Listing details at 390/1440px in both themes, plus the mobile admin verification queue in both themes. Neutral camera illustrations and fictional accounts exist only in intercepted test fixtures; no sample inventory was added to the product.

In this cloud task they live at `/workspace/reports/erental-redesign/screenshots/`. Set `ERENTAL_SCREENSHOT_DIR` to another output folder to regenerate them locally. These are captured artifacts, not pixel-baseline regression approvals. Browser tests check layout and behavior; a person or reviewer must inspect composition.

## Known limits and preserved backend risks

- No live Supabase integration, real upload, email delivery, hosted RLS or concurrent database transaction has been validated by this redesign. The previously documented cloud proxy block remains a separate environment issue; fixtures never establish server security.
- The previous verification RPC hardening proposal remains **unapplied**. This UI milestone does not change RPCs or fix the documented hosted concurrency risk.
- Unsaved listing/profile work is protected for linked in-app navigation and actual unload. Existing BrowserRouter history traversal (Back/Forward) is not blocked; a reload or leaving via unsupported history paths can lose memory-only work. Do not treat this as durable autosave.
- Existing owner queries exclude removed listings. The redesign explains that behavior and does not invent a removed-history endpoint.
- Messaging remains periodic polling, payments remain simulated, and account verification is not a guarantee of listing condition or rental outcome.
- Native popup visuals vary by platform. Physical-device, assistive-technology and full cross-browser acceptance remain unrun.

## Run locally

Use Node 22+ in the application folder. Configure the existing public frontend Supabase variables as explained in `LOCAL_SETUP_AND_TESTING.md`; never place a service-role key in Vite.

```sh
npm ci
npm run dev -- --port 5173 --strictPort
# Open http://localhost:5173/
# Stop with Ctrl+C.
```

For the self-contained fixture suite and build:

```sh
npx playwright install chromium
npm test
npm run build
```

Windows PowerShell can use `npm.cmd` and `npx.cmd`. The dedicated feature branch is pushed without merging or overwriting `main`. GitHub review availability is recorded in the final handoff.

## Files changed

- `DESIGN.md`
- `README.md`
- `REDESIGN.md`
- `UX-CONTRACT.md`
- `index.html`
- `package-lock.json`
- `package.json`
- `public/favicon.svg`
- `src/App.jsx`
- `src/components/Brand.jsx`
- `src/components/EmptyState.jsx`
- `src/components/Icon.jsx`
- `src/components/ListingCard.jsx`
- `src/components/ListingSkeleton.jsx`
- `src/components/PageHeading.jsx`
- `src/components/ReportListing.jsx`
- `src/components/RequestForm.jsx`
- `src/components/ReviewForm.jsx`
- `src/components/SearchBar.jsx`
- `src/components/ThemeControl.jsx`
- `src/components/UnsavedChangesGuard.jsx`
- `src/components/layout/Footer.jsx`
- `src/components/layout/Layout.jsx`
- `src/components/layout/Navbar.jsx`
- `src/context/ThemeContext.jsx`
- `src/main.jsx`
- `src/pages/AdminPage.jsx`
- `src/pages/AdminVerificationPage.jsx`
- `src/pages/AuthPage.jsx`
- `src/pages/BookingsPage.jsx`
- `src/pages/BrowsePage.jsx`
- `src/pages/ConversationPage.jsx`
- `src/pages/CreateListing.jsx`
- `src/pages/EditListing.jsx`
- `src/pages/Home.jsx`
- `src/pages/ListingDetail.jsx`
- `src/pages/MessagesPage.jsx`
- `src/pages/MyListings.jsx`
- `src/pages/NotFound.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/VerificationPage.jsx`
- `src/styles/account-auth.css`
- `src/styles/admin-reports.css`
- `src/styles/app.css`
- `src/styles/auth.css`
- `src/styles/base.css`
- `src/styles/bookings.css`
- `src/styles/conversation.css`
- `src/styles/detail.css`
- `src/styles/discovery.css`
- `src/styles/fonts.css`
- `src/styles/home.css`
- `src/styles/inbox.css`
- `src/styles/listings.css`
- `src/styles/owner-create.css`
- `src/styles/owner-management.css`
- `src/styles/profile.css`
- `src/styles/tokens.css`
- `src/styles/verification-admin.css`
- `src/styles/verification-user.css`
- `tests/e2e/auth-recovery.spec.js`
- `tests/e2e/core-workflows.spec.js`
- `tests/e2e/redesign.spec.js`
