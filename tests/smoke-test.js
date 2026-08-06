#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const classicId = "org_zimbracommunity_phishing_reporter_classic";
const modernId = "org_zimbracommunity_phishing_reporter_modern";

function run(command, args) {
  childProcess.execFileSync(command, args, { stdio: "inherit", cwd: root });
}

run("bash", ["scripts/build.sh"]);
run("node", ["--check", path.join("classic", classicId + ".js")]);
run("node", ["--check", path.join("modern", "index.js")]);

const forbiddenInRuntime = [
  "reportto@hornetsecurity.com",
  "sas.cloud-security.net",
  "94.100.132.73"
];

for (const file of [
  path.join(root, "classic", classicId + ".js"),
  path.join(root, "modern", "index.js"),
  path.join(root, "classic", "config_template.xml"),
  path.join(root, "modern", "config_template.xml")
]) {
  const text = fs.readFileSync(file, "utf8").toLowerCase();
  for (const marker of forbiddenInRuntime) {
    if (text.includes(marker.toLowerCase())) {
      throw new Error(`Forbidden hard-coded runtime marker ${marker} in ${file}`);
    }
  }
}

for (const [zipName, required] of [
  [classicId + ".zip", [classicId + ".xml", classicId + ".js", "config_template.xml"]],
  [modernId + ".zip", [modernId + ".xml", "index.js", "config_template.xml"]]
]) {
  const listing = childProcess.execFileSync("unzip", ["-Z1", path.join(root, "dist", zipName)], { encoding: "utf8" });
  for (const entry of required) {
    if (!listing.replace(/\r/g, "").trim().split("\n").includes(entry)) {
      throw new Error(`Missing ${entry} in ${zipName}`);
    }
  }
}

console.log("Smoke tests passed.");
