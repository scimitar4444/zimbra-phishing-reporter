# Veröffentlichung auf GitHub

## 1. Repository anlegen

Auf GitHub ein neues leeres Repository mit dem Namen `zimbra-phishing-reporter` erstellen. Beim Anlegen keine zusätzliche README, Lizenz oder `.gitignore` erzeugen, da diese Dateien bereits vorhanden sind.

## 2. Projekt hochladen

Im entpackten Projektordner:

```bash
git init -b main
git add .
git commit -m "Initial release 2.0.0"
git remote add origin https://github.com/DEIN-BENUTZERNAME/zimbra-phishing-reporter.git
git push -u origin main
```

Alternativ mit GitHub CLI:

```bash
git init -b main
git add .
git commit -m "Initial release 2.0.0"
gh repo create zimbra-phishing-reporter --public --source=. --remote=origin --push
```

## 3. Release veröffentlichen

```bash
git tag -a v2.0.0 -m "Zimbra Phishing Reporter 2.0.0"
git push origin v2.0.0
```

Danach auf GitHub unter **Releases → Draft a new release** den Tag `v2.0.0` auswählen und diese Dateien aus `dist/` anhängen:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`
- `SHA256SUMS`

Vor dem Push prüfen, dass keine internen Adressen, Kennwörter, Mail-Exporte oder andere vertrauliche Daten enthalten sind.
