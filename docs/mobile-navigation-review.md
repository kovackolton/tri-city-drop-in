# Mobile navigation

Below 768 CSS pixels the main navigation is collapsed behind a 44px-minimum Menu button. The current page remains visible below the brand, even while navigation is closed. Desktop retains the sidebar. All navigation entries expose their active page, and the button exposes expanded state and the controlled navigation region.

The menu expands in the normal page flow, so it does not obscure content or require a modal focus trap. Choosing a destination closes it and focuses main content; Escape from within the navigation closes it and returns focus to the toggle. Other profile/payment navigation paths and sign-out also close it. The button uses existing theme colors and existing focus styling. Production Angular build and 34 frontend logic checks passed. Actual mobile-browser and screen-reader checks remain manual.

The following mobile improvements are now implemented:

- Upcoming-game filters live in a collapsed disclosure with an applied-filter count. Unused dates and whitespace-only searches do not count. Applying filters closes the disclosure; entered filter values remain available when reopened.
- The phone header puts account name, verification and sign-out controls in an Account disclosure while leaving notification/settings/theme buttons readily accessible. Desktop keeps its existing account display. Escape closes the account disclosure, and navigating also closes it.
- Phone buttons/summaries have a 44px minimum height. Join/Waitlist, payment-review and dialog primary actions use full width. Form text is at least 16px on phones, and confirmation actions wrap instead of squeezing into one row.
- Phone roster summaries use stacked cards with a full-width Manage button. Payment and strike summaries remain visible; rating details are in the expanded player view. Attendance/booking controls sit behind their own disclosure. Player filters/details stack into one column; management tabs can scroll locally if needed.
- Event creation/editing groups teams, public contacts, selected players and equipment into expandable sections without removing controls from the DOM. Native validation opens the containing sections and shows linked inline field errors; correcting a field clears its stale message. Existing price acknowledgment, waiver, ownership and draft/publication rules are unchanged.

Validation: production Angular compilation and 36 frontend logic checks passed, including applied-filter counting and reopening invalid collapsed sections without losing form data. A temporary headless Edge session served the real production build with local mock public events, checked no horizontal overflow at 320/375/430/1024px, exercised navigation/filter disclosure and captured a phone screenshot for review. No production accounts or external services were used. Signed-in organizer/payment flows, real Safari/Android browsers, screen readers, large text/zoom, landscape and software-keyboard behavior still need device checks.

References: [WAI disclosure navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [WCAG reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). The 44px target is a usability goal; WCAG 2.2 AA's minimum target-size criterion is 24px with defined exceptions.
