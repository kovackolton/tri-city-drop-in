# Organizer payment-profile links

Event creation/editing offers fixed Venmo, Cash App and PayPal URL prefixes with optional username/Cashtag inputs under Organizer contact & payment options. Empty fields hide the method. Omitted edit fields retain the existing values; empty/null clears them. Primary/co-organizer ownership and administrator permissions are unchanged.

Supported HTTPS forms: venmo.com/u/username (including www/account aliases), cash.app/$Cashtag, paypal.me/username, and paypal.com/paypalme/username. URLs normalize to canonical service profile links. Validation rejects other hosts, credentials, custom ports, query strings, fragments and unsupported paths. This checks URL shape, not account existence or ownership; organizers are instructed to verify the recipient. Server validation protects storage and client validation suppresses invalid legacy values.

Logo links appear on booked-game cards in My games and full organizer workspace cards, including when no email/phone is supplied. Browsing cards on Upcoming games and shared/private joining views do not display payment options. Links open a new tab with noopener/noreferrer, visible provider names, tooltips and keyboard focus styling. Logos are local static SVG assets, so rendering does not fetch images or call payment services. No payment SDK, credentials, webhooks or automatic payment/strike changes are introduced.

Migration 20261109010000_event_payment_links adds three nullable Event columns. Applied locally; the production migration job must run it before releasing this version. Existing How to guides were updated without new image placeholders.

Logo paths: [Venmo](https://github.com/simple-icons/simple-icons/blob/develop/icons/venmo.svg), [Cash App](https://github.com/simple-icons/simple-icons/blob/develop/icons/cashapp.svg), [PayPal](https://github.com/simple-icons/simple-icons/blob/develop/icons/paypal.svg), from Simple Icons. Provider link reference: [PayPal.Me help](https://www.paypal.com/us/cshelp/article/paypalme-frequently-asked-questions-help432), [Cash App sending and receiving](https://cash.app/learn/getting-started/how-to-send-and-receive-money), [Venmo account profiles](https://help.venmo.com/cs/articles/check-or-edit-your-username-vhel208).

Validation: 43 API unit tests, 76 isolated PostgreSQL scenarios and 51 frontend logic tests passed. Local browser checks verified all three local logos, safe new-tab link attributes, edit preservation, both themes and no horizontal overflow at 320-1920 pixels on public cards, My games, workspace cards and organizer fields.

Username inputs keep full validated URLs in the API model. Editing extracts saved usernames; clearing a username removes that method. A leading @ or $ is handled without duplicating the prefix. Prefixes stack above the editable username on narrow phones.
