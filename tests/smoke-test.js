#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const classicId = "org_zimbracommunity_phishing_reporter_classic";
const modernId = "org_zimbracommunity_phishing_reporter_modern";
const expectedClassicVersion = "2.2.1";
const expectedModernVersion = "2.2.1";

function run(command, args) {
  childProcess.execFileSync(command, args, { stdio: "inherit", cwd: root });
}

run("bash", ["scripts/build.sh"]);
run("node", ["--check", path.join("classic", classicId + ".js")]);
run("node", ["--check", path.join("modern", "index.js")]);
run("node", [path.join("tests", "modern-timeout-test.js")]);

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

for (const [file, expectedVersion] of [
  [path.join(root, "classic", classicId + ".xml"), expectedClassicVersion],
  [path.join(root, "modern", modernId + ".xml"), expectedModernVersion],
  [path.join(root, "classic", "config_template.xml"), expectedClassicVersion],
  [path.join(root, "modern", "config_template.xml"), expectedModernVersion]
]) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(`version="${expectedVersion}"`)) {
    throw new Error(`Version ${expectedVersion} missing in ${file}`);
  }
}

for (const profile of [
  path.join(root, "classic", "config_template.xml"),
  path.join(root, "modern", "config_template.xml"),
  ...fs.readdirSync(path.join(root, "config-examples"), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => ["classic.xml", "modern.xml"].map(name =>
      path.join(root, "config-examples", entry.name, name)))
]) {
  const text = fs.readFileSync(profile, "utf8");
  if (!text.includes('version="2.2.1"') || !text.includes('name="maxBatchMessages"')) {
    throw new Error(`Batch/version configuration missing in ${profile}`);
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

  const sourceName = zipName.startsWith(classicId) ? classicId + ".js" : "index.js";
  const sourcePath = zipName.startsWith(classicId) ?
    path.join(root, "classic", sourceName) : path.join(root, "modern", sourceName);
  const archivedSource = childProcess.execFileSync("unzip", ["-p", path.join(root, "dist", zipName), sourceName]);
  if (!archivedSource.equals(fs.readFileSync(sourcePath))) {
    throw new Error(`Packaged source differs from ${sourcePath}`);
  }
}

const sums = fs.readFileSync(path.join(root, "dist", "SHA256SUMS"), "utf8");
if (!sums.includes(classicId + ".zip") || !sums.includes(modernId + ".zip")) {
  throw new Error("SHA256SUMS does not list both packages");
}

console.log("Smoke tests passed.");
