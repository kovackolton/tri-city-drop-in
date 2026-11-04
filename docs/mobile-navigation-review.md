# Mobile navigation

Below 768 CSS pixels the main navigation is collapsed behind a 44px-minimum Menu button. The current page remains visible below the brand, even while navigation is closed. Desktop retains the sidebar. All navigation entries expose their active page, and the button exposes expanded state and the controlled navigation region.

The menu expands in the normal page flow, so it does not obscure content or require a modal focus trap. Choosing a destination closes it and focuses main content; Escape from within the navigation closes it and returns focus to the toggle. Other profile/payment navigation paths and sign-out also close it. The button uses existing theme colors and existing focus styling. Production Angular build and 34 frontend logic checks passed. Actual mobile-browser and screen-reader checks remain manual.

Potential next improvements, not implemented here:

- Collapse upcoming-game filters behind a button with an active-filter count, bringing games closer to the top.
- Reduce header wrapping by simplifying the signed-in account display on narrow screens.
- Review Join/Waitlist and payment actions for 44px touch targets, suitable spacing and clear full-width primary buttons on phones.
- Use stacked roster entries and horizontally scrollable team controls where dense organizer views cannot reflow cleanly.
- Break long event-creation forms into expandable sections while preserving inputs and showing errors beside fields.
- Check layouts at 320, 375 and 430 CSS pixels, large text/zoom, landscape, the software keyboard and iOS/Android safe areas.

References: [WAI disclosure navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [WCAG reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). The 44px target is a usability goal; WCAG 2.2 AA's minimum target-size criterion is 24px with defined exceptions.
