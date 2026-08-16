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

Vor dem Tag müssen dieselbe Versionsnummer tragen:

- `classic/org_zimbracommunity_phishing_reporter_classic.xml`
- `modern/org_zimbracommunity_phishing_reporter_modern.xml`
- `classic/config_template.xml`
- `modern/config_template.xml`
- alle XML-Dateien unter `config-examples/`
- Versionskommentare in den beiden JavaScript-Dateien
- `CHANGELOG.md`

## Release erzeugen

Beispiel für Version 2.1.0:

```bash
git tag -a v2.1.0 -m "Zimbra Phishing Reporter 2.1.0"
git push origin v2.1.0
```

Im GitHub-Release werden diese erzeugten Dateien aus `dist/` veröffentlicht:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`
- `SHA256SUMS`

Die Release-Dateien müssen aus genau dem getaggten Commit gebaut werden.
