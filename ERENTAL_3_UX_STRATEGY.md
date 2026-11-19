# eRental 3.0 marketplace journeys

For a first-time visitor in Iligan City, the first task is to find something rentable nearby. Owners need a short path from a draft to a published listing and the next incoming request. The same profile serves both roles. English labels, local place names and peso rates apply throughout.

| Journey | Entry and progression | Canonical owner |
| --- | --- | --- |
| Discover | Home search or category → browsable, shareable results → listing photo, price and status → dates, estimate and request | Home, SearchBar, BrowsePage, ListingCard, ListingDetail, RequestForm |
| List and manage | List an item → fill listing sections → inspect draft summary → publish → My listings → edit, change availability or open incoming bookings | CreateListing / EditListing, UnsavedChangesGuard, MyListings |
| Fulfil a booking | Bookings → renter or owner view → status and dates → allowed action → confirmation → updated request or recoverable status | BookingsPage, Dialog, booking helpers |
| Coordinate | Messages → find a thread by participant/listing or unread state → read, compose, refresh and return to inbox | MessagesPage, ConversationPage |
| Account and trust | Log in, register or reset password → My profile → edit account details, appearance or submit proof → see actual request history | AuthContext, AuthPage, RecoveryPage, ProfilePage, VerificationPage |
| Moderate | Authorized Admin destination → listing reports or verification requests → review one case → explicitly confirm a decision | RequireAdmin, AdminNavigation, private document viewer and review RPC |

## Navigation and page hierarchy

Desktop keeps the brand, a search entry point, task navigation and account controls in the header. Mobile gives regular destinations a compact bottom bar and keeps secondary links in a labeled disclosure. Authorization gates both admin navigation and content. The footer groups discovery and account links. Native search fields, selects and date inputs retain platform keyboard behavior.

Discovery is photo-led. Inventory, booking and moderation pages use rows and clear reading order. Each working screen gets one primary heading and one prominent action for the current task. Scope, filter state and server-confirmed status belong next to the data they describe. Section numbers express an actual form sequence only.

## Interaction rules

Use semantic tokens and shared controls for feedback, field labels, buttons, dialogs and keyboard focus. Keep 44px primary targets. Let the page scroll at narrow widths. Reserve local scrolling for category navigation, readable queues or conversation history. Announce meaningful loading, error and success states. Reconcile uncertain writes before a retry where the existing service supports it. Keep the message draft and entered form values on recoverable failures.

Use active filter labels in the result context, preserve the URL across Back and Forward, and clear only the chosen constraint. Sign-in and review gates continue to consult the existing session and server role. A verification badge comes only from the protected profile fields. [Interaction contract](UX-CONTRACT.md)
