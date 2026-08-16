# Zimbra Phishing Reporter

Ein konfigurierbares Zimlet zur einfachen Meldung verdächtiger E-Mails in der klassischen und modernen Zimbra-Weboberfläche.

Die vollständige Originalnachricht wird als RFC822-/EML-Anhang an eine konfigurierte Meldestelle übermittelt. Nutzer müssen die Nachricht nicht selbst als Anlage weiterleiten.

## Funktionen

- Unterstützung für Zimbra Classic und Modern
- direkte Schaltfläche in der Classic-Toolbar
- Eintrag **Phishing melden** im Menü **Mehr** der Modern-Oberfläche
- Weiterleitung der vollständigen Originalnachricht als RFC822-/EML-Anhang
- konfigurierbares internes Prüfpostfach
- optionale Erkennung und getrennte Weiterleitung von Phishing-Simulationen
- optionale Hornetsecurity-Beispielkonfiguration
- Verschieben der Originalmail erst nach erfolgreicher Annahme der Meldung
- Schutz vor doppelter Meldung derselben Nachricht innerhalb einer Browsersitzung
- konfigurierbare Hinweise, Fehlermeldungen und Betreffpräfixe
- technische Fehlercodes ohne Offenlegung interner Serverdetails
- automatisierte Laufzeit-, Erkennungs-, Paket- und Syntaxprüfungen

## Classic und Modern

In **Classic** erscheint eine direkte Schaltfläche in der Nachrichten-Toolbar.

In **Modern** befindet sich die Aktion bewusst unter **Mehr → Phishing melden**. Ein direkter Toolbar-Button wurde in der Zielumgebung erprobt, ließ sich dort aber nicht zuverlässig integrieren. Die Modern-Variante verwendet deshalb ausschließlich den funktionierenden Menü-Erweiterungspunkt; dies ist kein noch offener Implementierungspunkt.

## Eindeutige Nachrichtenauswahl

Das Zimlet meldet ausschließlich eine eindeutig bestimmte einzelne Nachricht. Eine Konversations-ID wird niemals als Nachrichten-ID verwendet.

Enthält eine Unterhaltung mehrere Nachrichten und stellt Zimbra dem Zimlet die gerade aktive Einzelmail nicht eindeutig bereit, erscheint der Hinweis:

> Bitte öffnen Sie die verdächtige E-Mail einzeln und versuchen Sie es erneut.

Damit wird verhindert, dass versehentlich die erste oder eine andere Nachricht aus derselben Unterhaltung übertragen wird.

## Ablauf einer Meldung

### Erkannte Phishing-Simulation

Entspricht die E-Mail den konfigurierten Erkennungsmerkmalen:

1. Die Originalnachricht wird an die konfigurierte Meldeadresse für Simulationen gesendet.
2. Nach erfolgreicher Annahme wird die Nachricht optional in den Zielordner verschoben.
3. Der Nutzer erhält die konfigurierte Erfolgsmeldung.

### Sonstige verdächtige E-Mail

Wird die E-Mail nicht als Simulation erkannt oder kann die Klassifizierung nicht abgeschlossen werden:

1. Die Originalnachricht wird ausschließlich an das interne Prüfpostfach gesendet.
2. Sie wird nicht automatisch an den externen Simulationsanbieter übermittelt.
3. Nach erfolgreicher Annahme wird sie optional in den Zielordner verschoben.
4. Der Nutzer erhält die konfigurierte Erfolgsmeldung.

Ein Klassifizierungsfehler blockiert somit nicht die interne Meldung.

## Simulationserkennung ohne Veränderung der E-Mail

Das Zimlet **liest ausschließlich bereits vorhandene E-Mail-Header**. Es setzt, ergänzt oder verändert weder die Nachricht noch ihre Header. Es ist keine Änderung am Zimbra-Mailflow erforderlich.

Die Erkennung verwendet die konfigurierten Merkmale in dieser Reihenfolge:

1. Eine Regel passt auf den konfigurierten Disclaimer-Header, beispielsweise `X-Disclaimer`.
2. Oder `dkim=pass` und die konfigurierte `header.d`-Domain stehen im selben Ergebnisabschnitt eines `Authentication-Results`-Headers.
3. Oder eine passende `DKIM-Signature` tritt gemeinsam mit einem konfigurierten Merkmal aus `Received` auf.

Die Bedingungen sind ODER-verknüpft. Die vorhandene praktische Erkennung über den Disclaimer bleibt damit erhalten. Die DKIM-Auswertung verhindert zugleich, dass ein `dkim=pass` einer fremden Domain mit einem getrennten fehlgeschlagenen Ergebnis der Simulationsdomain kombiniert wird.

Wenn Zimbra die angeforderten freien Header nicht vollständig über SOAP liefert, liest das Zimlet einmalig die authentifizierte RFC822-Darstellung. Dieser Fallback wird nur verwendet, wenn eine für die konfigurierte Erkennung benötigte Headerfamilie fehlt. Die Gesamtdauer ist durch `classificationTimeoutMs` begrenzt.

Da die Klassifizierung ausschließlich im Client anhand vorhandener Header erfolgt, hängt ihre Verlässlichkeit von den tatsächlich zugestellten Headern und dem eigenen Mailflow ab. Die Beispielwerte müssen vor einem Rollout mit echten Simulationsmails geprüft werden.

## Sichere Standardeinstellungen

Die Standardpakete enthalten absichtlich:

- keine interne Meldeadresse
- keine Meldeadresse für Simulationen
- keine organisationsspezifischen Produktivdaten
- deaktivierte Simulationserkennung
- deaktiviertes Debug-Logging

Vor dem produktiven Einsatz muss eine Konfiguration angewendet werden.

## Installation

Beide Pakete als Benutzer `zimbra` installieren:

```bash
zmzimletctl deploy /pfad/zu/org_zimbracommunity_phishing_reporter_classic.zip
zmzimletctl deploy /pfad/zu/org_zimbracommunity_phishing_reporter_modern.zip
```

Danach die passenden Konfigurationsprofile anwenden:

```bash
zmzimletctl configure /pfad/zu/classic.xml
zmzimletctl configure /pfad/zu/modern.xml
zmprov fc -a zimlet
```

Die Nutzer müssen die Weboberfläche anschließend gegebenenfalls vollständig neu laden oder sich ab- und wieder anmelden.

## Beispielkonfigurationen

Generische Profile befinden sich in:

```text
config-examples/generic-de/
config-examples/generic-en/
```

Die Beispieladresse `phishing@example.org` muss durch das eigene interne Prüfpostfach ersetzt werden.

Ein optionales Hornetsecurity-Profil befindet sich in:

```text
config-examples/hornetsecurity-de/
```

Es wertet bereits vorhandene Disclaimer-, DKIM- und Transportheader aus. Es fügt der Mail nichts hinzu. Die enthaltenen Anbieterwerte sind Beispiele und müssen vor dem Einsatz gegen aktuelle Testmails und die eigene Headerkette geprüft werden.

## Fehlerbehandlung

Die Originalmail wird erst verschoben, nachdem Zimbra die Meldemail angenommen hat.

- Versand fehlgeschlagen: Die Mail bleibt im bisherigen Ordner.
- Versand erfolgreich, Verschieben fehlgeschlagen: Die Meldung ist bereits erfolgt; der Nutzer erhält den Fehlercode `PR-MOVE-01`.
- Versand fehlgeschlagen: Der Nutzer erhält den Fehlercode `PR-SEND-01`.
- Klassifizierung fehlgeschlagen oder abgelaufen: Die interne Melderoute wird verwendet.

Technische Fehlerdetails werden standardmäßig nicht im Dialog angezeigt. Mit `debugLogging=true` können Administratoren Diagnoseinformationen in der Browserkonsole aktivieren. Es werden dabei keine Mailinhalte bewusst protokolliert.

## Wichtige Konfigurationseigenschaften

| Eigenschaft | Bedeutung |
|---|---|
| `internalReportAddress` | Genau eine interne Meldeadresse. |
| `simulationReportAddress` | Genau eine Meldeadresse für erkannte Simulationen. |
| `moveReportedMessage` | Verschieben nach erfolgreicher Meldung aktivieren oder deaktivieren. |
| `targetFolderId` | Zimbra-ID des Zielordners; `4` ist üblicherweise Spam/Junk und muss geprüft werden. |
| `simulationDetectionEnabled` | Optionale Simulationserkennung aktivieren. |
| `simulationDisclaimerHeader` | Vorhandener Header, der auf Disclaimer-Regeln geprüft wird. |
| `simulationDisclaimerRules` | Semikolongetrennte ODER-Regeln; Begriffe innerhalb einer Regel sind mit `|` UND-verknüpft. |
| `simulationDkimDomains` | Kommagetrennte DKIM-Domains. |
| `simulationSourceIndicators` | Kommagetrennte Merkmale aus `Received`; nur gemeinsam mit passender DKIM-Signatur wirksam. |
| `classificationTimeoutMs` | Maximale Gesamtdauer der Klassifizierung, standardmäßig 12.000 ms. |
| `debugLogging` | Optionale technische Browserkonsolen-Ausgaben. |

Die vollständige Beschreibung steht in `docs/CONFIGURATION.de.md`.

## Erstellung und Tests

Voraussetzungen:

- Bash
- Node.js
- ZIP-Kommandozeilenprogramm

Pakete und Prüfsummen erzeugen:

```bash
./scripts/build.sh
```

Alle automatisierten Prüfungen ausführen:

```bash
node tests/detection-test.js
node tests/smoke-test.js
```

Die Pakete werden in `dist/` erzeugt:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`
- `SHA256SUMS`

## Kompatibilität und Rollout

Das Projekt wurde für Zimbra-10.x-Weboberflächen entwickelt. Installationen, Themes, Patchstände und Modern-Client-Versionen können sich unterscheiden.

Vor einer breiten Verteilung sollten mindestens folgende Fälle mit einem Testkonto geprüft werden:

- einzelne Mail in Classic
- einzelne Mail in Modern über **Mehr**
- mehrteilige Unterhaltung und anschließend einzeln geöffnete Mail
- erkannte Simulationsmail
- normale interne Melderoute
- Mail mit großem Anhang
- Versand erfolgreich, Verschieben absichtlich nicht möglich

## Sicherheit und Datenschutz

Die vollständige Originalnachricht wird als RFC822-/EML-Anhang übertragen. Sie kann personenbezogene Daten, vertrauliche Inhalte, Anhänge, interne Adressen sowie Authentifizierungs- und Trackingheader enthalten.

Meldeempfänger, Postfachberechtigungen, Aufbewahrung und Löschung müssen den Vorgaben der jeweiligen Organisation entsprechen. Passwörter, Token, private Mail-Exporte, interne Produktivadressen und vertrauliche Protokolle gehören nicht in das öffentliche Repository.

## Lizenz und Haftungsausschluss

Das Projekt steht unter der MIT-Lizenz und ist ein unabhängiges Community-Projekt. Es ist weder mit Zimbra, Synacor noch Hornetsecurity verbunden und wird von diesen Unternehmen nicht offiziell unterstützt oder empfohlen. Zimbra und Hornetsecurity sind Marken der jeweiligen Rechteinhaber.
