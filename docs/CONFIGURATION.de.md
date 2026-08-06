# Konfiguration

Die Konfiguration steht in der jeweiligen `config_template.xml` und wird mit `zmzimletctl configure` angewendet.

## Weiterleitung

| Eigenschaft | Bedeutung |
|---|---|
| `internalReportAddress` | Pflichtadresse für E-Mails, die nicht als Simulation erkannt werden. |
| `simulationReportAddress` | Adresse für erkannte Simulationen. Nur erforderlich, wenn die Erkennung aktiv ist und eine Nachricht erkannt wird. |
| `internalSubjectPrefix` | Betreffpräfix für interne Meldungen. |
| `simulationSubjectPrefix` | Betreffpräfix für Simulationsmeldungen. |

## Verschieben der gemeldeten Nachricht

| Eigenschaft | Bedeutung |
|---|---|
| `moveReportedMessage` | `true` oder `false`. |
| `targetFolderId` | Zimbra-Ordner-ID. Der Standardwert `4` ist normalerweise Spam/Junk und sollte in der eigenen Umgebung geprüft werden. |

Die Nachricht wird erst verschoben, nachdem Zimbra die Meldemail angenommen hat. Schlägt der Versand fehl, bleibt die Originalmail im bisherigen Ordner.

## Erkennung einer Simulation

| Eigenschaft | Bedeutung |
|---|---|
| `simulationDetectionEnabled` | Aktiviert die Erkennung. Standardmäßig deaktiviert. |
| `simulationDisclaimerHeader` | Header mit dem Hinweis des Simulationsanbieters. |
| `simulationDisclaimerRules` | Mit Semikolon getrennte ODER-Regeln. Innerhalb einer Regel müssen alle mit `|` getrennten Begriffe vorkommen. |
| `simulationDkimDomains` | Mit Komma getrennte DKIM-Domains. Ein bestätigtes `dkim=pass` wird als Treffer gewertet. |
| `simulationSourceIndicators` | Mit Komma getrennte Werte aus den `Received`-Headern. Sie werden nur gemeinsam mit einer passenden DKIM-Signatur verwendet. |

Beispiel:

```xml
<property name="simulationDisclaimerRules">anbieter|phishing simulation;anbieter|training email</property>
```

Damit muss entweder `anbieter` zusammen mit `phishing simulation` oder `anbieter` zusammen mit `training email` vorkommen.

Header lassen sich grundsätzlich fälschen. Bevorzugt werden sollten durch die eigene vertrauenswürdige Mail-Infrastruktur bestätigte `Authentication-Results`. Reine DKIM- oder IP-Angaben sind nur zusätzliche Merkmale.

## Texte

Buttonbeschriftung, Betreffpräfixe, Erfolgsmeldungen und Fehlermeldungen sind vollständig konfigurierbar. Alle Eigenschaften stehen in den Beispielen unter `config-examples/generic-de/` und `config-examples/generic-en/`.

## Änderungen anwenden

```bash
zmzimletctl configure /pfad/classic.xml
zmzimletctl configure /pfad/modern.xml
zmprov fc -a zimlet
```

Danach Zimbra neu laden oder ab- und wieder anmelden.


## Zeichencodierung

Für deutsche Texte verwenden die mitgelieferten XML-Konfigurationen
ASCII-sichere XML-Zeichenreferenzen. Dadurch bleiben Umlaute auch dann korrekt,
wenn `zmzimletctl configure` unter einer nicht UTF-8-fähigen Java- oder
System-Locale ausgeführt wird.

In `.properties`-Dateien werden deutsche Sonderzeichen als Java-Unicode-Escapes
gespeichert.
