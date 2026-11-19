# eRental 3.0 browser review

These are Chromium renders of the eRental application with intercepted Supabase requests. The same synthetic accounts, listing illustrations and transactions drive the before and after comparisons. The home banner is editorial imagery. Listing media below it comes from the listing response.

## Before and after

Each image shows the first 900 CSS pixels of the same route under the same viewport, theme and data conditions.

| Screen | Before | After |
| --- | --- | --- |
| Discover, desktop light | [Before](../before/light-1440-home.webp) | [After](light-1440-home.webp) |
| Browse, desktop light | [Before](../before/light-1440-browse.webp) | [After](light-1440-browse.webp) |
| My listings, mobile light | [Before](../before/light-390-my-listings.webp) | [After](light-390-my-listings.webp) |
| Bookings, mobile dark | [Before](../before/dark-390-bookings.webp) | [After](dark-390-bookings.webp) |

## Route contact sheets

Each sheet labels its screens. The mobile crops include the fixed navigation so its relationship to forms and message controls is visible.

| Screens | 390px light | 390px dark | 1440px light | 1440px dark |
| --- | --- | --- | --- | --- |
| Discover, browse, listing details, 404 | [View](discovery-light-390.webp) | [View](discovery-dark-390.webp) | [View](discovery-light-1440.webp) | [View](discovery-dark-1440.webp) |
| Create and edit listing, my listings, bookings, inbox, conversation | [View](rental-desk-light-390.webp) | [View](rental-desk-dark-390.webp) | [View](rental-desk-light-1440.webp) | [View](rental-desk-dark-1440.webp) |
| Login, registration, request a password reset, unusable recovery link, profile and settings | [View](account-light-390.webp) | [View](account-dark-390.webp) | [View](account-light-1440.webp) | [View](account-dark-1440.webp) |
| Verification, listing reports, administrator verification queue, access denied | [View](trust-light-390.webp) | [View](trust-dark-390.webp) | [View](trust-light-1440.webp) | [View](trust-dark-1440.webp) |

## Reproduce the full-resolution review

From the repository root, install dependencies and Chromium as described in the [setup guide](../../../LOCAL_SETUP_AND_TESTING.md). Use a temporary directory for the screenshots.

```sh
ERENTAL_SCREENSHOT_DIR=/tmp/erental-3-screens npm test -- redesign.spec.js
```

The browser tests save the full page and viewport at 390 and 1440px in both themes. They also check horizontal overflow at 320, 768 and 1024px and exercise search, keyboard operation, dialog and responsive focus, authentication and theme behavior. The suite intercepts the public API used by the application. Live authentication, storage authorization, physical-device keyboards and screen-reader announcements require separate acceptance tests.

## Accessibility review

Axe-core 4.11.0 scanned these 19 settled route states at 390 and 1440px in both themes against its WCAG A and AA rules through 2.2. Each scan waited for a visible page heading and route-specific content, such as the booking row, loaded thread or recovery error. All 76 renders stayed within the viewport and returned zero automated violations. Some contrast comparisons remained unresolved on the home, browse, detail, create, edit and conversation screens in both themes and widths. The browser suite separately measures foreground and background tokens for actions, fields, statuses and footer text.

The independent visual review caught a mobile Send button obscured by navigation and owner-editor step numbers breaking across two lines. The corrected screenshots show the full composer above the dock and intact step numbers. The image review covers application-owned states in Chromium. Screen-reader output, on-screen keyboards and the contents of native platform popups still need hands-on review.
