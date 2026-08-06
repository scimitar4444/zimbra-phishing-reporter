#!/usr/bin/env node
"use strict";

function splitList(value, separator) {
  return String(value || "").split(separator || ",").map(v => v.trim()).filter(Boolean);
}
function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function joined(map, name) {
  return ((map[String(name).toLowerCase()] || [])).join("\n").toLowerCase();
}
function isSimulation(map, config) {
  if (!config.enabled) return false;
  const content = joined(map, config.disclaimerHeader);
  const disclaimer = splitList(config.rules, ";").some(rule => {
    const markers = splitList(rule, "|");
    return markers.length && markers.every(marker => content.includes(marker.toLowerCase()));
  });
  const auth = joined(map, "Authentication-Results");
  const sig = joined(map, "DKIM-Signature");
  const domains = splitList(config.domains, ",");
  const matchDomain = text => domains.some(domain => new RegExp(
    "(?:header\\.d|\\bd)\\s*=\\s*" + escapeRegExp(domain.toLowerCase()) + "(?:\\s|;|$)", "i"
  ).test(text));
  const verified = /dkim\s*=\s*pass\b/.test(auth) && matchDomain(auth);
  const raw = matchDomain(sig);
  const received = joined(map, "Received");
  const source = splitList(config.sources, ",").some(item => received.includes(item.toLowerCase()));
  return disclaimer || verified || (raw && source);
}

const config = {
  enabled: true,
  disclaimerHeader: "X-Disclaimer",
  rules: "provider|simulate phishing;provider|phishing simulation",
  domains: "training.example.net",
  sources: "192.0.2.10,training-mta.example.net"
};

const simulated = {
  "x-disclaimer": ["This message was created by Provider to simulate phishing attacks."],
  "authentication-results": ["mx.example.org; dkim=pass header.d=training.example.net"],
  "received": ["from training-mta.example.net (192.0.2.10)"]
};
const normal = {
  "authentication-results": ["mx.example.org; dkim=pass header.d=legitimate.example.org"],
  "received": ["from legitimate.example.org (192.0.2.30)"]
};

if (!isSimulation(simulated, config)) throw new Error("Expected simulation match");
if (isSimulation(normal, config)) throw new Error("Unexpected normal-message match");
console.log("Detection tests passed.");
