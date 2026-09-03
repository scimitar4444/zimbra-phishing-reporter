# Zimbra Phishing Reporter

A configurable Zimlet for reporting suspicious email from the Zimbra Classic and Modern web clients.

The complete original message is submitted as an RFC822/EML attachment. Users do not need to forward the message manually as an attachment.

## Features

- support for Zimbra Classic and Modern
- direct toolbar button in Classic
- **Report phishing** entry in the Modern **More** menu
- complete original message forwarded as an RFC822/EML attachment
- configurable internal review mailbox
- optional detection and separate routing of phishing simulations
- optional Hornetsecurity example profile
- original message moved only after the report has been accepted
- duplicate-report protection for the current browser session
- configurable notifications, errors and subject prefixes
- stable support references without exposing internal server details
- automated runtime, detection, package and syntax checks

## Classic and Modern placement

Classic provides a direct action in the message toolbar.

Modern intentionally provides the action under **More → Report phishing**. A direct Modern toolbar button was tested in the target environment but could not be integrated reliably. The Modern package therefore uses only the working action-menu extension point; direct toolbar integration is not an outstanding implementation item.

## Unambiguous message selection

The Zimlet reports only an unambiguously identified individual message. It never submits a conversation ID as a message ID.

When a conversation contains multiple messages and Zimbra does not expose the active individual message unambiguously, the user is asked to open the suspicious email individually. This prevents the first or another arbitrary message in the thread from being transmitted.

## Reporting workflow

### Recognized phishing simulation

When an email matches the configured indicators:

1. The original message is submitted to the configured simulation reporting address.
2. After successful acceptance, the message is optionally moved to the target folder.
3. The configured success notification is displayed.

### Other suspicious email

When an email is not recognized as a simulation, or classification cannot be completed:

1. The original message is submitted only to the internal review mailbox.
2. It is not automatically submitted to the external simulation provider.
3. After successful acceptance, it is optionally moved to the target folder.
4. The configured success notification is displayed.

A classification failure therefore does not block internal reporting.

## Simulation detection without modifying email

The Zimlet **only reads headers that already exist on the message**. It does not set, add or modify the message or its headers, and it does not require a Zimbra mail-flow change.

Configured indicators are evaluated in this order:

1. A configured rule matches the selected disclaimer header, such as `X-Disclaimer`.
2. Or `dkim=pass` and the configured `header.d` domain occur in the same result clause of an `Authentication-Results` header.
3. Or a matching `DKIM-Signature` occurs together with a configured indicator from `Received`.

These conditions are OR-connected. The practical disclaimer-based recognition remains available, while the DKIM parser no longer combines a pass for an unrelated domain with a separate failed result for the simulation domain.

When Zimbra does not return all requested free headers through SOAP, the Zimlet reads the authenticated RFC822 representation once. This fallback is used only when a header family required by the configured classifiers is missing. Total classification time is limited by `classificationTimeoutMs`.

Because classification is performed in the client from existing headers, its reliability depends on the delivered headers and the local mail path. Example values must be validated against real simulation messages before rollout.

## Safe defaults

The default packages intentionally contain:

- no internal reporting address
- no simulation reporting address
- no organization-specific production data
- disabled simulation detection
- disabled debug logging

A configuration profile must be applied before production use.

## Installation

Deploy both packages as the `zimbra` user:

```bash
zmzimletctl deploy /path/to/org_zimbracommunity_phishing_reporter_classic.zip
zmzimletctl deploy /path/to/org_zimbracommunity_phishing_reporter_modern.zip
```

Apply the matching configuration profiles:

```bash
zmzimletctl configure /path/to/classic.xml
zmzimletctl configure /path/to/modern.xml
zmprov fc -a zimlet
```

Users may need to reload the web client completely or sign out and back in.

## Example profiles

Generic profiles are provided in:

```text
config-examples/generic-de/
config-examples/generic-en/
```

Replace `phishing@example.org` with the organization's internal review mailbox.

An optional Hornetsecurity profile is provided in:

```text
config-examples/hornetsecurity-de/
```

It evaluates disclaimer, DKIM and transport headers already present on the message. It does not add anything to the email. Vendor values in the example must be verified against current test messages and the organization's own header chain.

## Error handling

The original message is moved only after Zimbra accepts the report message.

- report submission failed: the original stays in its current folder
- report accepted but move failed: the user receives reference `PR-MOVE-01`
- report submission failed: the user receives reference `PR-SEND-01`
- classification failed or timed out: the internal reporting route is used

Technical server details are not displayed in user dialogs. Administrators may enable browser-console diagnostics with `debugLogging=true`. The implementation does not intentionally log message content.

## Important configuration properties

| Property | Meaning |
|---|---|
| `internalReportAddress` | Exactly one internal reporting address. |
| `simulationReportAddress` | Exactly one reporting address for recognized simulations. |
| `moveReportedMessage` | Enable or disable moving after successful reporting. |
| `targetFolderId` | Zimbra target-folder ID; `4` is commonly Spam/Junk and must be verified. |
| `simulationDetectionEnabled` | Enable optional simulation detection. |
| `simulationDisclaimerHeader` | Existing header evaluated by disclaimer rules. |
| `simulationDisclaimerRules` | Semicolon-separated OR rules; markers inside a rule are AND-connected with `|`. |
| `simulationDkimDomains` | Comma-separated DKIM domains. |
| `simulationSourceIndicators` | Comma-separated `Received` indicators; effective only with a matching DKIM signature. |
| `classificationTimeoutMs` | Maximum total classification duration, 12,000 ms by default. |
| `sendTimeoutMs` | Maximum wait for Zimbra `SendMsg`, 20,000 ms by default. |
| `moveTimeoutMs` | Maximum wait for the move operation, 15,000 ms by default. |
| `refreshTimeoutMs` | Maximum wait for list refresh, 10,000 ms by default. |
| `operationTimeoutMs` | Hard limit for one complete reporting operation, 70,000 ms by default. |
| `reportedMessageCooldownMs` | Time-limited duplicate-click guard per Zimbra message ID, 120,000 ms by default. |
| `debugLogging` | Optional technical browser-console output. |

See `docs/CONFIGURATION.md` for the complete reference.

## Build and tests

Requirements:

- Bash
- Node.js
- ZIP command-line utility

Build packages and checksums:

```bash
./scripts/build.sh
```

Run all automated checks:

```bash
node tests/detection-test.js
node tests/smoke-test.js
```

Generated files are written to `dist/`:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`
- `SHA256SUMS`

## Compatibility and rollout

The project was developed for Zimbra 10.x web clients. Installations, themes, patch levels and Modern-client versions may differ.

Before broad deployment, test at least:

- an individual message in Classic
- an individual message in Modern through **More**
- a multi-message conversation followed by an individually opened message
- a recognized simulation message
- the normal internal reporting route
- a message with a large attachment
- accepted submission with an intentionally failing move operation

## Security and privacy

The complete original message is transmitted as an RFC822/EML attachment. It may contain personal data, confidential content, attachments, internal addresses, authentication headers and tracking identifiers.

Recipients, mailbox permissions, retention and deletion must follow the organization's policies. Passwords, tokens, private mail exports, internal production addresses and confidential logs must not be committed to the public repository.

## License and disclaimer

This project is licensed under the MIT License and is an independent community project. It is not affiliated with, sponsored by, supported by or endorsed by Zimbra, Synacor or Hornetsecurity. Zimbra and Hornetsecurity are trademarks of their respective owners.
