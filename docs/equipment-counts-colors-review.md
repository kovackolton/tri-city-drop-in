# Bib quantities and named shirt colors

Create/edit event -> Team equipment now keeps supplied bibs and required shirt colors independent. Select Pinnies / bibs will be provided to reveal Number of bibs provided. The shirt-color count and individual color fields remain visible alongside it. New forms begin with two editable colors, dark and light. Increasing the count adds fields; decreasing it retains the remaining entered colors. Creation/reset restores the default pair.

The UI requires a bib quantity when the checkbox is selected, and a name for every selected shirt color. Server validation bounds bib quantities to 1–1000, shirt counts to 1–10 and names to 40 characters, trims labels and rejects blank/duplicate named colors. Disabling bibs clears the saved bib quantity without removing shirt guidance. Older events retain unknown quantities/unnamed shirt guidance rather than having historical choices invented. Their editor prepopulates the first two color fields where names were not previously specified so organizers can review them before saving.

Public event cards, private-game cards, the organizer workspace and My games show bib quantity and shirt guidance together. Listings, booking history and share-data responses include the new fields. Existing minimum-player targets and all booking rules remain unchanged. Equal color arrays count as no-op edits, preventing duplicate change notices/audits.

Deploy migration `20261106000000_equipment_counts_colors` before the new app revision. It adds bibCount and shirtColors and removes the old database rule that prohibited shirt guidance with bibs. Existing event values remain unchanged. The migration was applied locally only; production uses the normal migration job.

Production Angular compilation, 40 API unit checks, 67 isolated PostgreSQL scenarios and 44 frontend checks passed. A local browser check confirmed the combined display at phone/desktop widths. The combined Linux Cloud Run image built successfully with clean Prisma generation. Review existing handbook screenshots if they show the old Team equipment form; no screenshot filenames/placeholders changed.
