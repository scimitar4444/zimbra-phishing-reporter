# Konfiguration

Die Classic- und Modern-Pakete besitzen jeweils eine `config_template.xml`. Produktive Profile werden mit `zmzimletctl configure` angewendet.

## Weiterleitung

| Eigenschaft | Bedeutung |
|---|---|
| `internalReportAddress` | Pflichtadresse für nicht als Simulation erkannte Nachrichten. Genau eine einfache E-Mail-Adresse, keine Anzeigenamen oder Empfängerlisten. |
| `simulationReportAddress` | Adresse für erkannte Simulationen. Genau eine einfache E-Mail-Adresse. |
| `internalSubjectPrefix` | Betreffpräfix interner Meldungen. |
| `simulationSubjectPrefix` | Betreffpräfix erkannter Simulationen. |

Ungültige, mehrfache oder durch Zeilenumbrüche manipulierte Empfängerwerte werden abgelehnt.

## Verschieben der Originalnachricht

| Eigenschaft | Bedeutung |
|---|---|
| `moveReportedMessage` | `true` oder `false`. |
| `targetFolderId` | Zimbra-Ordner-ID. `4` ist häufig Spam/Junk und muss in der eigenen Umgebung geprüft werden. |

Die Originalnachricht wird erst verschoben, nachdem Zimbra die Meldemail angenommen hat. Scheitert der Versand, bleibt sie im bisherigen Ordner. Scheitert nur das Verschieben, wurde die Meldung bereits versendet.

## Simulationserkennung

| Eigenschaft | Bedeutung |
|---|---|
| `simulationDetectionEnabled` | Aktiviert die Erkennung. Standardwert: `false`. |
| `simulationDisclaimerHeader` | Name eines bereits vorhandenen Headers, beispielsweise `X-Disclaimer`. |
| `simulationDisclaimerRules` | Semikolongetrennte ODER-Regeln. Innerhalb einer Regel müssen alle mit `|` getrennten Begriffe vorkommen. |
| `simulationDkimDomains` | Kommagetrennte DKIM-Domains. |
| `simulationSourceIndicators` | Kommagetrennte Merkmale aus `Received`. Diese Route gilt nur zusammen mit einer passenden `DKIM-Signature`. |
| `classificationTimeoutMs` | Maximale Gesamtdauer der Klassifizierung in Millisekunden. Standard: `12000`; zulässiger Bereich im Code: 1.000 bis 60.000. |
| `sendTimeoutMs` | Maximale Wartezeit auf `SendMsg`. Standard: `20000`. Danach wird der Busy-Zustand aufgehoben; wegen unklarem Versandstatus bleibt der zeitliche Doppelklickschutz aktiv. |
| `moveTimeoutMs` | Maximale Wartezeit auf das Verschieben. Standard: `15000`. Ein Versand gilt zu diesem Zeitpunkt bereits als erfolgreich. |
| `refreshTimeoutMs` | Maximale Wartezeit auf die Aktualisierung der Nachrichtenliste. Standard: `10000`. |
| `operationTimeoutMs` | Harte Obergrenze für den vollständigen Modern-Meldevorgang. Standard: `70000`. |
| `reportedMessageCooldownMs` | Zeitlich begrenzter Doppelklickschutz je Zimbra-Nachrichten-ID. Standard: `120000`. |
| `maxBatchMessages` | Maximale Nachrichtenanzahl pro bestätigtem Stapel. Standard: `10`; Werte werden auf 1 bis 25 begrenzt. |

Das Zimlet verändert keine Mail und setzt keine Header. Es wertet ausschließlich Header aus, die bereits in der Nachricht vorhanden sind.

Eine Nachricht gilt als Simulation, wenn mindestens eine der folgenden Bedingungen erfüllt ist:

1. Eine Disclaimer-Regel passt.
2. In demselben DKIM-Ergebnisabschnitt stehen sowohl `dkim=pass` als auch eine konfigurierte `header.d`-Domain.
3. Eine konfigurierte Domain steht in `DKIM-Signature` und zusätzlich passt mindestens ein `Received`-Merkmal.

Beispiel einer Disclaimer-Konfiguration:

```xml
<property name="simulationDisclaimerHeader">X-Disclaimer</property>
<property name="simulationDisclaimerRules">anbieter|phishing simulation;anbieter|training email</property>
```

Damit passt entweder `anbieter` zusammen mit `phishing simulation` oder `anbieter` zusammen mit `training email`.

Die DKIM-Prüfung wertet jeden `Authentication-Results`-Wert und jeden semikolongetrennten Ergebnisabschnitt einzeln aus. Ein `dkim=pass` für Domain A wird nicht mit `header.d` aus einem anderen Ergebnis für Domain B kombiniert.

## Headerabruf und Fallback

Zunächst fordert das Zimlet die konfigurierten Header über `GetMsg` an. Liefert Zimbra alle für die aktiven Klassifikatoren erforderlichen Headerfamilien, erfolgt kein zusätzlicher Download.

Fehlt eine benötigte Headerfamilie, wird die authentifizierte RFC822-Darstellung über den lokalen Zimbra-Endpunkt gelesen. Classic schützt die XHR-Abschlüsse gegen doppelte Ereignisse; Modern verwendet nach Möglichkeit `AbortController`. Die gesamte Klassifizierung wird nach `classificationTimeoutMs` beendet.

Schlägt die Klassifizierung fehl oder läuft sie ab, wird die Nachricht sicherheitshalber an die interne Meldeadresse und nicht an die Simulationsadresse gesendet.

## Nachrichtenauswahl

Das Zimlet benötigt eine echte Nachrichten-ID. Konversations-IDs werden verworfen.

- Eine eindeutig geöffnete oder markierte Einzelmail kann gemeldet werden.
- Bis zu `maxBatchMessages` einzeln markierte Nachrichten können bestätigt und als Stapel verarbeitet werden.
- Jede Nachricht wird nacheinander separat klassifiziert, gemeldet und optional verschoben.
- Ein Einzelfehler stoppt die restlichen Nachrichten nicht. Die Abschlussmeldung nennt erfolgreiche, fehlgeschlagene, nicht verschobene und übersprungene Nachrichten.
- Enthält eine Unterhaltung mehrere Nachrichten und ist keine aktive Einzelmail eindeutig ermittelbar, muss der Nutzer die betreffende Mail einzeln öffnen.
- Ein Stapel mit einer mehrdeutigen Unterhaltung wird vollständig abgelehnt, bevor eine Meldung versendet wird.

## Oberfläche

Classic verwendet eine direkte Toolbar-Schaltfläche.

Modern registriert ausschließlich den Eintrag im Menü **Mehr**. Ein direkter Modern-Toolbar-Button ist für die Zielumgebung nicht zuverlässig umsetzbar und wird bewusst nicht erzeugt.

## Texte und Fehlercodes

Buttonbeschriftung, Betreffpräfixe, Erfolgs- und Fehlermeldungen sind konfigurierbar.

| Eigenschaft | Bedeutung |
|---|---|
| `busyMessage` | Eine Meldung wird bereits verarbeitet. |
| `selectOneMessageMessage` | Keine eindeutig bestimmte Einzelmail verfügbar. |
| `unsupportedSelectionMessage` | Die Auswahl enthält ein mehrdeutiges oder nicht unterstütztes Element. |
| `batchLimitMessage` | Die konfigurierte Stapelgrenze wurde überschritten. Unterstützt `{maximum}`. |
| `batchConfirmationMessage` | Rückfrage vor Beginn eines Stapels. Unterstützt `{count}`. |
| `batchProgressMessage` | Fortschritt je Nachricht. Unterstützt `{current}` und `{total}`. |
| `batchSummaryMessage` | Abschlusszahlen. Unterstützt `{reported}`, `{failed}`, `{notMoved}` und `{skipped}`. |
| `alreadyReportedMessage` | Die Nachricht wurde vor Kurzem gemeldet und ist noch durch den zeitlich begrenzten Doppelklickschutz gesperrt. |
| `sendErrorMessage` | Versand der Meldung fehlgeschlagen. |
| `sendTimeoutMessage` | Die Sendebestätigung ist abgelaufen; ein bereits erfolgter Versand ist möglich. |
| `moveErrorMessage` | Meldung versendet, Verschieben fehlgeschlagen. |
| `moveTimeoutMessage` | Meldung versendet, aber Verschieben nicht rechtzeitig bestätigt. |
| `operationTimeoutMessage` | Der gesamte Meldevorgang hat seine harte Zeitgrenze erreicht und wurde für weitere Bedienung freigegeben. |
| `configurationErrorInvalidAddress` | Konfigurierte Empfängeradresse ist ungültig. |
| `errorReferenceLabel` | Bezeichnung vor dem technischen Referenzcode. |

Endnutzer sehen keine ungefilterten SOAP-, Server- oder JavaScript-Fehlerdetails. Relevante Referenzen sind unter anderem `PR-SEND-01`, `PR-SEND-TIMEOUT`, `PR-MOVE-01`, `PR-MOVE-TIMEOUT` und `PR-TIMEOUT-01`.

## Debug-Logging

| Eigenschaft | Bedeutung |
|---|---|
| `debugLogging` | Bei `true` werden Klassifizierungsweg und technische Fehler mit Referenzcode in der Browserkonsole protokolliert. Standard: `false`. |

Die Diagnoseausgaben sind für Administratoren vorgesehen. Die Implementierung schreibt bewusst keine Nachrichtentexte oder Anlagen in das Debug-Log.

## Änderungen anwenden

```bash
zmzimletctl configure /pfad/classic.xml
zmzimletctl configure /pfad/modern.xml
zmprov fc -a zimlet
```

Danach die Zimbra-Weboberfläche vollständig neu laden oder ab- und wieder anmelden.

## Zeichencodierung

Die deutschen XML-Profile verwenden ASCII-sichere XML-Zeichenreferenzen. Dadurch bleiben Umlaute auch bei einer ungünstigen Java- oder System-Locale korrekt. In `.properties`-Dateien werden deutsche Sonderzeichen als Java-Unicode-Escapes gespeichert.
