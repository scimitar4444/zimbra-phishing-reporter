# Configuration

The Classic and Modern packages each contain a `config_template.xml`. Apply production profiles with `zmzimletctl configure`.

## Routing

| Property | Meaning |
|---|---|
| `internalReportAddress` | Required recipient for messages not recognized as simulations. Exactly one plain email address; no display names or recipient lists. |
| `simulationReportAddress` | Recipient for recognized simulations. Exactly one plain email address. |
| `internalSubjectPrefix` | Subject prefix for internal reports. |
| `simulationSubjectPrefix` | Subject prefix for recognized simulations. |

Invalid, multiple or line-break-injected recipient values are rejected.

## Moving the original message

| Property | Meaning |
|---|---|
| `moveReportedMessage` | `true` or `false`. |
| `targetFolderId` | Zimbra folder ID. `4` is commonly Spam/Junk and must be verified locally. |

The original message is moved only after Zimbra accepts the report message. A failed submission leaves it in its current folder. If only the move fails, the report has already been sent.

## Simulation detection

| Property | Meaning |
|---|---|
| `simulationDetectionEnabled` | Enables detection. Default: `false`. |
| `simulationDisclaimerHeader` | Name of an already existing header, such as `X-Disclaimer`. |
| `simulationDisclaimerRules` | Semicolon-separated OR rules. Every marker separated by `|` inside one rule must occur. |
| `simulationDkimDomains` | Comma-separated DKIM domains. |
| `simulationSourceIndicators` | Comma-separated indicators from `Received`. This route is valid only together with a matching `DKIM-Signature`. |
| `classificationTimeoutMs` | Maximum total classification duration in milliseconds. Default: `12000`; the implementation clamps values to 1,000–60,000. |
| `sendTimeoutMs` | Maximum wait for `SendMsg`. Default: `20000`. Busy is released afterwards; the cooldown remains because delivery status is uncertain. |
| `moveTimeoutMs` | Maximum wait for moving the message. Default: `15000`. Reporting has already succeeded at this stage. |
| `refreshTimeoutMs` | Maximum wait for refreshing the message list. Default: `10000`. |
| `operationTimeoutMs` | Hard limit for the complete Modern reporting operation. Default: `70000`. |
| `reportedMessageCooldownMs` | Time-limited duplicate-click guard per Zimbra message ID. Default: `120000`. |
| `maxBatchMessages` | Maximum messages per confirmed batch. Default: `10`; values are clamped to 1–25. |

The Zimlet does not modify messages or add headers. It only evaluates headers already present on the message.

A message is treated as a simulation when at least one condition is true:

1. A disclaimer rule matches.
2. The same DKIM result clause contains both `dkim=pass` and a configured `header.d` domain.
3. A configured domain occurs in `DKIM-Signature` and at least one configured `Received` indicator also matches.

Example disclaimer configuration:

```xml
<property name="simulationDisclaimerHeader">X-Disclaimer</property>
<property name="simulationDisclaimerRules">provider|phishing simulation;provider|training email</property>
```

The DKIM parser evaluates every `Authentication-Results` value and each semicolon-delimited result clause separately. A pass for domain A is not combined with `header.d` from another result for domain B.

## Header retrieval and fallback

The Zimlet first requests configured headers through `GetMsg`. When Zimbra returns all header families required by the active classifiers, no additional download is performed.

If a required family is missing, the authenticated RFC822 representation is read from the local Zimbra endpoint. Classic protects XHR completion against duplicate events; Modern uses `AbortController` when available. Total classification is stopped after `classificationTimeoutMs`.

When classification fails or times out, the message is submitted to the internal recipient rather than the simulation recipient.

## Message selection

The Zimlet requires a real message ID. Conversation IDs are rejected.

- An unambiguously opened or selected individual message can be reported.
- Up to `maxBatchMessages` individually selected messages can be confirmed and processed as a batch.
- Every batch item is classified, reported and optionally moved separately and sequentially.
- An item failure does not stop the remaining messages. The final summary reports successful, failed, not-moved and skipped counts.
- When a thread contains several messages and no active individual message is exposed unambiguously, the user must open the relevant message individually.
- A batch containing an ambiguous conversation is rejected before any message is sent.

## User interface

Classic uses a direct toolbar button.

Modern registers only the action in the **More** menu. A direct Modern toolbar button is not reliable in the target environment and is intentionally not generated.

## Text and support references

Button labels, subject prefixes, success and error messages are configurable.

| Property | Meaning |
|---|---|
| `busyMessage` | A report is already being processed. |
| `selectOneMessageMessage` | No unambiguous individual message is available. |
| `unsupportedSelectionMessage` | The selection contains an ambiguous or unsupported item. |
| `batchLimitMessage` | The configured batch limit was exceeded. Supports `{maximum}`. |
| `batchConfirmationMessage` | Confirmation before a batch begins. Supports `{count}`. |
| `batchProgressMessage` | Per-item progress. Supports `{current}` and `{total}`. |
| `batchSummaryMessage` | Final counts. Supports `{reported}`, `{simulation}`, `{internal}`, `{failed}`, `{notMoved}` and `{skipped}`. Route counts include only reports accepted by Zimbra. |
| `alreadyReportedMessage` | The message was reported recently and remains under the time-limited duplicate-click guard. |
| `sendErrorMessage` | Report submission failed. |
| `sendTimeoutMessage` | Send confirmation timed out; the report might already have been sent. |
| `moveErrorMessage` | Report submitted but moving failed. |
| `moveTimeoutMessage` | Report submitted, but moving was not confirmed in time. |
| `operationTimeoutMessage` | The complete operation reached its hard deadline and was released for further interaction. |
| `configurationErrorInvalidAddress` | Configured recipient is invalid. |
| `errorReferenceLabel` | Label displayed before the support reference. |

Users do not receive raw SOAP, server or JavaScript error details. Relevant references include `PR-SEND-01`, `PR-SEND-TIMEOUT`, `PR-MOVE-01`, `PR-MOVE-TIMEOUT` and `PR-TIMEOUT-01`.

## Debug logging

| Property | Meaning |
|---|---|
| `debugLogging` | When `true`, classification paths and technical errors are written to the browser console with a reference. Default: `false`. |

Diagnostics are intended for administrators. The implementation does not intentionally write message bodies or attachments to the debug log.

## Applying changes

```bash
zmzimletctl configure /path/classic.xml
zmzimletctl configure /path/modern.xml
zmprov fc -a zimlet
```

Reload the Zimbra web client completely or sign out and back in.
