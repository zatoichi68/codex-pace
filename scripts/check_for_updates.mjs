#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REMOTE_VERSION_URL = "https://raw.githubusercontent.com/zatoichi68/codex-pace/main/VERSION";
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const jsonOutput = process.argv.includes("--json");
const strict = process.argv.includes("--strict");

export function parseVersion(value, source) {
  const version = String(value).trim();
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`${source} returned an invalid version.`);
  }
  return version;
}

export function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function print(result) {
  if (jsonOutput) {
    console.log(JSON.stringify(result));
    return;
  }

  if (result.status === "update-available") {
    console.log(`Codex Pace update available: ${result.localVersion} → ${result.remoteVersion}.`);
    console.log('Ask Codex: "Update the codex-pace skill."');
  } else if (result.status === "up-to-date") {
    console.log(`Codex Pace is up to date (${result.localVersion}).`);
  } else if (result.status === "ahead") {
    console.log(`Codex Pace local version ${result.localVersion} is ahead of published ${result.remoteVersion}.`);
  } else {
    console.log(`Codex Pace update check unavailable: ${result.message}`);
  }
}

async function main() {
  try {
    const localVersion = parseVersion(
      await readFile(new URL("../VERSION", import.meta.url), "utf8"),
      "Local VERSION",
    );
    const response = await fetch(REMOTE_VERSION_URL, {
      cache: "no-store",
      headers: { "User-Agent": "codex-pace-update-check" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    const remoteVersion = parseVersion(await response.text(), "Published VERSION");
    const comparison = compareVersions(localVersion, remoteVersion);
    const status = comparison < 0
      ? "update-available"
      : comparison > 0
        ? "ahead"
        : "up-to-date";
    print({ status, localVersion, remoteVersion, repository: "zatoichi68/codex-pace" });
  } catch (error) {
    print({
      status: "unavailable",
      message: error instanceof Error ? error.message : String(error),
    });
    if (strict) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
