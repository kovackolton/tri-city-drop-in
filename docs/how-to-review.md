# In-app How to handbook

How to is a main navigation destination available while signed out or signed in. It contains 26 task guides grouped into Getting started, Playing, Organizing and Administration. Its layout uses a documentation directory, searchable guide text, selected-guide highlighting, breadcrumbs, On this page links, numbered instructions, notes and related guides. On narrower screens the directory moves behind Browse guides; it uses the existing light/dark theme and 44px mobile controls. The structure is inspired by documentation resources such as [Angular's documentation](https://angular.dev/overview), with app-specific content and styling.

The handbook has its own full-width main container: the desktop directory hugs the content area's left edge directly beside the main app sidebar, rather than being inset by the normal centered-page margins. Article width stays bounded for reading. At phone/tablet widths the directory becomes a full-width disclosure with a scrollable tree and 16px search input; article sections, screenshots and related guides flow beneath it.

Everyone sees player guides. Organizers additionally see workspace guides, and administrators see both organizer and administrator guides. Search and related links use the same role filtering. A restricted/unknown guide link falls back to the starting guide with an explanation, including when the viewer loses a role. These are interface instructions, not private account data or a replacement for backend permission checks.

Guide URLs use `/#how-to/guide-id`, so refreshing/bookmarking works on the existing hosting setup. Selecting a section scrolls/focuses the relevant heading without replacing that guide URL. Existing private-game invite parameters are retained while consulting the handbook. The guide catalog is `apps/web/src/app/how-to/how-to-content.ts`; content is rendered as text, with no raw HTML/Markdown injection.

Coverage includes sign-in/verification/reset, profile/contact/avatar/ratings, waiver, mobile navigation/themes, game filters/maps/equipment, joining and paid acknowledgment, guests/FIFO waitlists, private invites, My games/history/cancellation, payments/strikes, notifications, sharing/email cards, organizer requests, workspace scopes, event creation/privacy, locations, editing/lifecycle, post-creation additions, roster/history, teams, payment receipt review, attendance/overrides, user roles/admin ratings, organizer-request review, permanent strikes and administrator event deletion. The current waiver remains authoritative; guide text does not alter it or record consent.

## Screenshots

There are 28 labeled screenshot placeholders and a matching [capture checklist](how-to-screenshot-checklist.md). Put PNGs at the exact listed paths inside `apps/web/public/images/how-to/`, then build/deploy. A matching file automatically replaces the placeholder; missing/unreadable images retain the labeled panel. Captions and alt text come from the catalog's image title. No image upload service is added. Screenshots are public static assets, so use fictional data and omit credentials, private invitation keys and personal contacts.

## Validation

Production Angular build and 43 frontend checks passed. New coverage verifies role filtering/downgrades, restricted direct links, guide search, related-link integrity and a checklist entry for every unique screenshot placeholder. Local headless Edge checked no horizontal overflow at 320/375/430/1024px, deep-link loading, mobile directory/search navigation, restricted-guide fallback, missing-image placeholders and a newly supplied image replacing its placeholder. Actual user screenshots and final device/screen-reader review remain to be supplied/reviewed. No database migration or new external service is required.
