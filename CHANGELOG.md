# Changelog

## [2.2.1] - 2026-09-03

- show separate simulation and internal-review counts in Classic and Modern batch summaries
- count only reports accepted by Zimbra in the route breakdown
- keep message subjects, senders and other message data out of the summary
- add mixed-route regression coverage for both web clients

## [2.2.0] - 2026-09-03

- add confirmed batch reporting for up to 10 selected messages in Classic and Modern
- send, classify and optionally move every selected message independently and sequentially
- preserve the separate simulation and internal routes for every item
- continue processing after an individual send or move failure
- show per-item progress and a final reported/failed/not-moved/skipped summary
- reject ambiguous conversations and oversized batches before sending
- add send and move timeouts plus a time-limited duplicate guard to Classic
- refresh the Modern message list once after a completed batch
- add regression coverage for Classic and Modern batches, partial failure, limits and mixed routing

## [2.1.2] - 2026-09-03

- bound Modern `SendMsg`, move, refresh and complete report operations with configurable timeouts
- always release the Modern busy state, including stalled client promises
- replace the browser-session message lock with a short configurable cooldown
- keep an uncertainty cooldown after send timeouts to avoid accidental duplicate reports
- add clear timeout messages and stable support references
- no functional change to the Classic reporting flow

## [2.1.1] - 2026-09-02

- fix Modern runtime configuration lookup when Zimbra returns a same-name descriptor before the configured Zimlet object
- add a regression test for the descriptor-first account SOAP response
- no reporting addresses or organization-specific settings are included in the packages
- no functional change to the Classic reporting flow

## [2.1.0] - 2026-08-16

- prevent conversation IDs from being submitted as message IDs
- require an unambiguous individual message in Classic and Modern conversation views
- keep the Modern action intentionally in the **More** menu; no direct Modern toolbar integration is attempted
- preserve the existing client-side simulation model: the Zimlet only reads headers already present on the message and never adds or changes headers
- require `dkim=pass` and the configured `header.d` value to occur in the same `Authentication-Results` result clause
- keep the existing disclaimer match and DKIM-signature-plus-source fallback behavior
- limit classification requests with a configurable total timeout
- guard Classic raw-header callbacks against duplicate completion events
- avoid unnecessary RFC822 fallback downloads when all required header families are already available
- scope Modern configuration lookup to this Zimlet instead of scanning unrelated Zimlet settings
- try both supported Apollo refresh methods in Modern when the first one fails
- prevent duplicate reports of the same message during one browser session
- validate that each reporting route contains exactly one plain email address
- hide technical server details from user dialogs and provide stable support references instead
- add optional debug logging for administrators
- expand automated tests to cover conversation handling, DKIM result isolation, configuration collisions, duplicate callbacks, duplicate reports, refresh fallback and safe error messages

## [2.0.1] - 2026-08-06

- fixed German text encoding in Zimbra configuration profiles
- German XML profiles now use ASCII-safe character references
- German Zimlet metadata now uses Java Unicode escapes
- no change to the reporting workflow

## [2.0.0] - 2026-08-06

- first public, organization-neutral release
- configurable internal and simulation report recipients
- configurable simulation detection rules
- configurable user-facing texts and subject prefixes
- optional move to a configurable target folder
- safe defaults with no recipients and detection disabled
- packages for Zimbra Classic and Modern web clients
