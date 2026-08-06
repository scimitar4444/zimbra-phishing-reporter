#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
CLASSIC_ID="org_zimbracommunity_phishing_reporter_classic"
MODERN_ID="org_zimbracommunity_phishing_reporter_modern"

rm -f "$DIST/$CLASSIC_ID.zip" "$DIST/$MODERN_ID.zip" "$DIST/SHA256SUMS"

(
  cd "$ROOT/classic"
  zip -X -q "$DIST/$CLASSIC_ID.zip" \
    "$CLASSIC_ID.properties" \
    "${CLASSIC_ID}_de.properties" \
    "$CLASSIC_ID.xml" \
    "$CLASSIC_ID.css" \
    "$CLASSIC_ID.js" \
    shield-alert-16.png \
    config_template.xml
)

(
  cd "$ROOT/modern"
  zip -X -q "$DIST/$MODERN_ID.zip" \
    "$MODERN_ID.properties" \
    "${MODERN_ID}_de.properties" \
    "$MODERN_ID.xml" \
    index.js \
    config_template.xml
)

(
  cd "$DIST"
  sha256sum "$CLASSIC_ID.zip" "$MODERN_ID.zip" > SHA256SUMS
)

echo "Built packages in $DIST"
