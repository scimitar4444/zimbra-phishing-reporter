# Veröffentlichung auf GitHub

## Voraussetzungen

Vor einer Veröffentlichung:

```bash
node tests/detection-test.js
node tests/smoke-test.js
```

Zusätzlich prüfen:

```bash
cd dist
sha256sum -c SHA256SUMS
unzip -t org_zimbracommunity_phishing_reporter_classic.zip
unzip -t org_zimbracommunity_phishing_reporter_modern.zip
```

Es dürfen keine Passwörter, Token, privaten Mail-Exporte, internen Produktivadressen oder vertraulichen Protokolle enthalten sein.

## Branch und Pull Request

Änderungen zunächst auf einem separaten Branch veröffentlichen und über einen Pull Request prüfen. Ein Versionsrelease sollte erst nach einem End-to-End-Test in Classic und Modern erstellt werden.

## Version aktualisieren

Vor dem Tag müssen die Versionsnummern der tatsächlich geänderten Oberfläche
zusammenpassen:

- der Descriptor und `config_template.xml` der geänderten Oberfläche
- ihre XML-Dateien unter `config-examples/`
- ihr Versionskommentar im JavaScript
- `expectedClassicVersion` beziehungsweise `expectedModernVersion` im Smoke-Test
- `CHANGELOG.md`

Bei einem ausschließlich Modern oder Classic betreffenden Patch behält das
unveränderte Paket seine bisherige interne Versionsnummer und Binärdatei. In
den Release Notes muss dies ausdrücklich genannt werden.

## Release erzeugen

Beispiel für Version 2.2.1:

```bash
git tag -a v2.2.1 -m "Zimbra Phishing Reporter 2.2.1"
git push origin v2.2.1
```

Im GitHub-Release werden diese erzeugten Dateien aus `dist/` veröffentlicht:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`
- `SHA256SUMS`

Die Release-Dateien müssen aus genau dem getaggten Commit gebaut werden.
