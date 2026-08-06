# Zimbra Phishing Reporter

Ein konfigurierbares Zimlet zur Meldung verdächtiger E-Mails mit nur einem Klick für die klassische und moderne Zimbra-Weboberfläche.

Nutzer können verdächtige E-Mails melden, ohne sie manuell als Anhang weiterleiten zu müssen.

## Funktionen

- Unterstützung für die klassische und moderne Zimbra-Oberfläche
- Meldung verdächtiger E-Mails mit einem Klick
- Weiterleitung der vollständigen Originalnachricht als RFC822-/EML-Anhang
- konfigurierbares internes Prüfpostfach
- optionale Erkennung von Phishing-Simulationen
- getrennte Weiterleitung erkannter Simulationen
- optionale Beispielkonfiguration für den Hornetsecurity Security Awareness Service
- konfigurierbare Hinweis- und Fehlermeldungen
- optionales Verschieben in einen konfigurierbaren Ordner nach erfolgreicher Meldung
- nicht blockierende Erfolgshinweise
- Fehlerdialoge bei fehlgeschlagener Meldung
- deutsche und englische Beispielkonfigurationen

## Ablauf einer Meldung

### Erkannte Phishing-Simulation

Entspricht eine E-Mail den konfigurierten Erkennungsmerkmalen einer Simulation, läuft die Meldung folgendermaßen ab:

1. Die Originalnachricht wird an die konfigurierte Meldeadresse für Simulationen weitergeleitet.
2. Der Nutzer erhält eine Erfolgsmeldung.
3. Die gemeldete E-Mail wird in den konfigurierten Zielordner verschoben.

Beispiel für die Meldung:

> **Sehr gut erkannt!**  
> Diese E-Mail war Teil einer Phishing-Simulation und wurde erfolgreich gemeldet.

### Sonstige verdächtige E-Mail

Wird eine E-Mail nicht als Simulation erkannt, läuft die Meldung folgendermaßen ab:

1. Die Originalnachricht wird ausschließlich an das konfigurierte interne Prüfpostfach weitergeleitet.
2. Sie wird nicht automatisch an einen externen Anbieter weitergeleitet.
3. Der Nutzer erhält eine entsprechende Meldung.
4. Die gemeldete E-Mail wird in den konfigurierten Zielordner verschoben.

Beispiel für die Meldung:

> Die verdächtige E-Mail wurde an die interne Prüfstelle weitergeleitet.  
> Eine Rückmeldung erfolgt nicht automatisch.

Durch diese Trennung wird verhindert, dass versehentlich gemeldete legitime E-Mails automatisch an einen externen Anbieter übermittelt werden.

## Sichere Standardeinstellungen

Die Standardpakete enthalten absichtlich sichere Voreinstellungen:

- keine interne Meldeadresse
- keine Meldeadresse für Simulationen
- keine organisationsspezifischen Daten
- deaktivierte Simulationserkennung

Die Zimlets müssen vor dem produktiven Einsatz konfiguriert werden.

## Downloads

Fertige Installationspakete stehen im Bereich **GitHub Releases** zur Verfügung.

Enthaltene Pakete:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`
- `SHA256SUMS`

## Installation

Beide Pakete als Benutzer `zimbra` installieren:

```bash
zmzimletctl deploy /pfad/zu/org_zimbracommunity_phishing_reporter_classic.zip
zmzimletctl deploy /pfad/zu/org_zimbracommunity_phishing_reporter_modern.zip
```

Anschließend eine Konfiguration anwenden:

```bash
zmzimletctl configure /pfad/zu/classic.xml
zmzimletctl configure /pfad/zu/modern.xml
zmprov fc -a zimlet
```

Die Nutzer müssen die Zimbra-Weboberfläche gegebenenfalls neu laden oder sich vollständig ab- und wieder anmelden.

## Generische Konfiguration

Generische deutsche und englische Beispielkonfigurationen befinden sich in:

```text
config-examples/generic-de/
config-examples/generic-en/
```

Vor dem Anwenden einer Beispielkonfiguration muss die Beispieladresse

```text
phishing@example.org
```

durch das interne Prüfpostfach der eigenen Organisation ersetzt werden.

## Hornetsecurity Security Awareness Service

Das Repository enthält eine optionale Beispielkonfiguration für Phishing-Simulationen des Hornetsecurity Security Awareness Service:

```text
config-examples/hornetsecurity-de/
```

Erkannte Hornetsecurity-Simulationen können als RFC822-/EML-Anhang an folgende Meldeadresse weitergeleitet werden:

```text
reportto@hornetsecurity.com
```

Die Meldeadresse und die Erkennungsmerkmale sind konfigurierbar.

Die mitgelieferte Beispielkonfiguration kann unter anderem folgende Merkmale auswerten:

- spezielle E-Mail-Kopfzeilen
- DKIM-Domänen
- versendende IP-Adressen
- Absenderinformationen

E-Mails, die nicht als Simulation erkannt werden, gehen ausschließlich an das konfigurierte interne Prüfpostfach. Sie werden nicht automatisch an Hornetsecurity weitergeleitet.

Dadurch wird verhindert, dass versehentlich gemeldete legitime E-Mails automatisch an Hornetsecurity übermittelt werden.

Die Simulationserkennung ist standardmäßig deaktiviert.

Die mitgelieferten Werte sind Beispiele und müssen vor dem Einsatz geprüft werden. Kopfzeilen, Absenderadressen und technische Infrastruktur des Anbieters können sich ändern.

## Fehlerbehandlung

Schlägt die Meldung einer E-Mail fehl:

- erscheint ein Fehlerdialog
- bleibt die Originalnachricht im bisherigen Ordner
- kann der Nutzer die Meldung später erneut versuchen

Eine E-Mail wird erst verschoben, nachdem die Weiterleitung erfolgreich abgeschlossen wurde.

## Konfigurationsdokumentation

Eine ausführliche Dokumentation befindet sich in:

- `docs/CONFIGURATION.md`
- `docs/CONFIGURATION.de.md`
- `README.md`

## Erstellung der Pakete

Voraussetzungen:

- Bash
- Node.js
- ZIP-Kommandozeilenprogramm

Installationspakete erstellen:

```bash
./scripts/build.sh
```

Smoke-Test ausführen:

```bash
node tests/smoke-test.js
```

Die erzeugten Pakete werden in folgendem Ordner gespeichert:

```text
dist/
```

## Kompatibilität

Das Projekt wurde für die Weboberflächen von Zimbra 10.x entwickelt.

Zimbra-Installationen, Themes und Patchstände können sich unterscheiden. Vor einer breiten Verteilung sollten die klassische und die moderne Oberfläche mit einem Testkonto geprüft werden.

## Sicherheit und Datenschutz

Die vollständige Originalnachricht wird als RFC822-/EML-Anhang weitergeleitet.

Gemeldete E-Mails können unter anderem folgende Inhalte enthalten:

- personenbezogene Daten
- vertrauliche Informationen
- Dateianhänge
- interne E-Mail-Adressen
- Authentifizierungsinformationen in Kopfzeilen
- Tracking- und Identifikationsmerkmale

Meldeempfänger, Postfachberechtigungen, Aufbewahrungsfristen und Löschverfahren sollten den Sicherheits- und Datenschutzvorgaben der jeweiligen Organisation entsprechen.

Folgende Inhalte dürfen nicht in einem öffentlichen Repository gespeichert werden:

- Passwörter
- API-Schlüssel
- Zugriffstoken
- private E-Mail-Exporte
- interne Produktivadressen
- organisationsspezifische Konfigurationen
- vertrauliche Screenshots oder Protokolldateien

## Mitwirkung

Fehlermeldungen und Beiträge sind willkommen.

Eine Fehlermeldung sollte möglichst folgende Angaben enthalten:

- verwendete Zimbra-Version
- klassische oder moderne Oberfläche
- Browser und Browserversion
- relevante Fehlermeldung
- Schritte zur Reproduktion des Problems

Private E-Mail-Inhalte, Authentifizierungstoken oder vertrauliche Konfigurationen dürfen nicht veröffentlicht werden.

Weitere Hinweise befinden sich in `CONTRIBUTING.md`.

## Lizenz

Dieses Projekt steht unter der MIT-Lizenz.

Weitere Informationen befinden sich in [LICENSE](LICENSE).

## Haftungsausschluss

Dieses Projekt ist ein unabhängiges Community-Projekt.

Es steht in keiner Verbindung zu Zimbra, Synacor oder Hornetsecurity und wird von diesen Unternehmen weder gesponsert, unterstützt noch offiziell empfohlen.

Zimbra und Hornetsecurity sind Marken der jeweiligen Rechteinhaber.
