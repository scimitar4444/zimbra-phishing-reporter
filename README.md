# Zimbra Phishing Reporter

A configurable one-click phishing reporting Zimlet for the Zimbra Classic and Modern web clients.

## Features

- forwards the selected message as an attached RFC822/EML message
- uses an internal review mailbox for normal reports
- optionally recognizes phishing simulation messages from configurable headers
- optionally routes recognized simulations to a separate address
- optionally moves successfully reported messages to a configurable folder
- shows non-blocking success notifications and blocking error dialogs
- includes separate packages for the Classic and Modern Zimbra interfaces

The default package is intentionally safe: **no reporting addresses are preconfigured and simulation detection is disabled**. Configure the Zimlets before use.

## Downloads

Build artifacts are written to `dist/`:

- `org_zimbracommunity_phishing_reporter_classic.zip`
- `org_zimbracommunity_phishing_reporter_modern.zip`

## Quick start

```bash
./scripts/build.sh
node tests/smoke-test.js
```

Deploy as the `zimbra` user:

```bash
zmzimletctl deploy /path/to/org_zimbracommunity_phishing_reporter_classic.zip
zmzimletctl deploy /path/to/org_zimbracommunity_phishing_reporter_modern.zip
```

Apply a configuration profile, for example the German generic profile:

```bash
zmzimletctl configure config-examples/generic-de/classic.xml
zmzimletctl configure config-examples/generic-de/modern.xml
zmprov fc -a zimlet
```

Replace `phishing@example.org` before applying the profile. Users may need to reload the web client or sign out and back in.

## Configuration

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md). German documentation is available in [README.de.md](README.de.md) and [docs/CONFIGURATION.de.md](docs/CONFIGURATION.de.md).

## Simulation profiles

`config-examples/hornetsecurity-de/` contains an example profile for Hornetsecurity simulations. Vendor indicators can change. Verify and maintain the values for your own tenant before deployment.

Messages that do not match a simulation rule are sent only to the configured internal review mailbox. They are not automatically sent to the simulation provider.

## Compatibility

The project was developed for Zimbra 10.x web clients. Zimbra installations differ, so test both interfaces with a dedicated account before broad deployment.

## Security and privacy

The complete original email is forwarded as an attachment. It can contain personal or confidential information. Choose reporting recipients, retention, and access permissions according to your organization's policies.

Never commit passwords, API keys, private mail exports, or organization-specific production configuration to a public repository.

## License

MIT. See [LICENSE](LICENSE).

This community project is not affiliated with or endorsed by Zimbra, Synacor, or any simulation provider.
