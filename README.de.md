# Zimbra Phishing Reporter

Ein konfigurierbares Zimlet zum Melden verdächtiger E-Mails mit einem Klick. Es enthält getrennte Pakete für die klassische und die moderne Zimbra-Oberfläche.

## Funktionen

- leitet die ausgewählte E-Mail als originale EML/RFC822-Anlage weiter
- nutzt für normale Meldungen ein internes Prüfpostfach
- kann Phishing-Simulationen anhand frei konfigurierbarer Header erkennen
- kann erkannte Simulationen an eine separate Adresse melden
- kann erfolgreich gemeldete E-Mails in einen konfigurierbaren Ordner verschieben
- zeigt Erfolg als kurze Einblendung und Fehler als Dialog an

Die Standardpakete enthalten absichtlich **keine Zieladresse**. Außerdem ist die Erkennung von Simulationen zunächst deaktiviert. Vor dem Einsatz muss eine Konfiguration angewendet werden.

## Bauen und prüfen

```bash
./scripts/build.sh
node tests/smoke-test.js
```

Die fertigen Pakete liegen anschließend unter `dist/`:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`

## Installation

Als Benutzer `zimbra`:

```bash
zmzimletctl deploy /pfad/org_zimbracommunity_phishing_reporter_classic.zip
zmzimletctl deploy /pfad/org_zimbracommunity_phishing_reporter_modern.zip
```

Danach eine Konfiguration anwenden, zum Beispiel die deutsche Standardkonfiguration:

```bash
zmzimletctl configure config-examples/generic-de/classic.xml
zmzimletctl configure config-examples/generic-de/modern.xml
zmprov fc -a zimlet
```

Vorher in beiden XML-Dateien `phishing@example.org` durch die eigene interne Meldeadresse ersetzen. Anschließend Zimbra neu laden oder ab- und wieder anmelden.

## Verhalten

Nicht als Simulation erkannte E-Mails werden ausschließlich an das interne Prüfpostfach weitergeleitet. Dadurch werden versehentlich gemeldete legitime E-Mails nicht automatisch an einen externen Anbieter übermittelt.

Bei erfolgreicher Meldung kann die Nachricht in den konfigurierten Zielordner verschoben werden. Standardmäßig ist dies Ordner-ID `4`, üblicherweise der Spam-Ordner.

## Konfiguration

Alle Optionen sind in [docs/CONFIGURATION.de.md](docs/CONFIGURATION.de.md) beschrieben.

Das Beispiel unter `config-examples/hornetsecurity-de/` zeigt eine mögliche Erkennung von Hornetsecurity-Simulationen. Die Merkmale des Anbieters können sich ändern und müssen vor dem produktiven Einsatz geprüft und gepflegt werden.

## Datenschutz

Die vollständige Originalmail wird als Anlage weitergeleitet. Sie kann personenbezogene oder vertrauliche Inhalte enthalten. Zielpostfach, Zugriffsrechte und Aufbewahrung müssen zur eigenen Organisation passen.

Keine Kennwörter, Schlüssel, echten Mail-Exporte oder produktiven internen Adressen in ein öffentliches Repository übernehmen.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Das Projekt ist ein unabhängiges Community-Projekt und wird nicht von Zimbra oder einem Anbieter für Phishing-Simulationen unterstützt oder bestätigt.
