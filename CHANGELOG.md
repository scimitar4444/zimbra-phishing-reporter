# Changelog

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
