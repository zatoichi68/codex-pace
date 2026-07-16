#!/usr/bin/env node

import { spawn } from "node:child_process";
import readline from "node:readline";

const jsonOutput = process.argv.includes("--json");
const timeoutMs = 15_000;
const child = spawn("codex", ["app-server", "--stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

const lines = readline.createInterface({ input: child.stdout });
let rates = null;
let usage = null;
let finished = false;
let timer;

function send(payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function stop(code, error) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  lines.close();
  child.kill("SIGTERM");
  if (error) console.error(error);
  process.exitCode = code;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function chooseLimit(response) {
  const byId = response?.rateLimitsByLimitId;
  return byId?.codex ?? (byId ? Object.values(byId)[0] : null) ?? response?.rateLimits ?? null;
}

function calculate(response) {
  const limit = chooseLimit(response);
  if (!limit) throw new Error("Codex did not return a rate-limit snapshot.");
  const windows = [limit.primary, limit.secondary].filter(Boolean);
  const weekly = windows.sort(
    (a, b) => (b.windowDurationMins ?? 0) - (a.windowDurationMins ?? 0),
  )[0];
  if (!weekly?.windowDurationMins || !weekly?.resetsAt) {
    throw new Error("Codex did not return a complete usage window.");
  }

  const nowMs = Date.now();
  const durationMs = weekly.windowDurationMins * 60_000;
  const resetMs = weekly.resetsAt * 1_000;
  const startMs = resetMs - durationMs;
  const elapsedFraction = clamp((nowMs - startMs) / durationMs, 0.01, 1);
  const usedFraction = clamp((weekly.usedPercent ?? 0) / 100, 0, 1);
  const pace = usedFraction / elapsedFraction;
  const burnPerMs = usedFraction / Math.max(nowMs - startMs, 1);
  const projectedLimitMs = burnPerMs > 0 ? startMs + 1 / burnPerMs : null;
  const danger = projectedLimitMs !== null && pace > 1.05 && projectedLimitMs < resetMs;
  const hoursEarly = projectedLimitMs === null
    ? 0
    : Math.max(0, (resetMs - projectedLimitMs) / 3_600_000);
  const slowdownPercent = danger ? Math.max(0, Math.round((1 - 1 / pace) * 100)) : 0;
  const resetCreditsAvailable = Math.max(
    0,
    Number(response?.rateLimitResetCredits?.availableCount ?? 0),
  );
  const proactiveFraction = 0.95;
  const resetSchedule = [];

  if (burnPerMs > 0 && resetCreditsAvailable > 0) {
    const firstIdealMs = Math.max(nowMs, startMs + proactiveFraction / burnPerMs);
    const cycleMs = proactiveFraction / burnPerMs;
    const bufferMs = (1 - proactiveFraction) / burnPerMs;
    for (let index = 0; index < Math.min(resetCreditsAvailable, 10); index += 1) {
      const idealMs = firstIdealMs + index * cycleMs;
      const latestMs = idealMs + bufferMs;
      resetSchedule.push({
        credit: index + 1,
        idealAt: new Date(idealMs).toISOString(),
        latestAt: new Date(latestMs).toISOString(),
        neededBeforeNaturalReset: idealMs < resetMs,
      });
    }
  }

  const resetsUsefulBeforeNaturalReset = resetSchedule.filter(
    (item) => item.neededBeforeNaturalReset,
  ).length;

  return {
    planType: limit.planType ?? "unknown",
    limitId: limit.limitId ?? "codex",
    windowDurationHours: weekly.windowDurationMins / 60,
    usedPercent: Number((usedFraction * 100).toFixed(1)),
    elapsedPercent: Number((elapsedFraction * 100).toFixed(1)),
    paceMultiplier: Number(pace.toFixed(2)),
    danger,
    resetAt: new Date(resetMs).toISOString(),
    projectedLimitAt: projectedLimitMs === null ? null : new Date(projectedLimitMs).toISOString(),
    hoursBeforeReset: Number(hoursEarly.toFixed(1)),
    recommendedSlowdownPercent: slowdownPercent,
    resetCreditsAvailable,
    resetStrategy: {
      proactiveTriggerPercent: 95,
      resetsUsefulBeforeNaturalReset,
      creditsPreserved: Math.max(0, resetCreditsAvailable - resetsUsefulBeforeNaturalReset),
      schedule: resetSchedule,
    },
    lifetimeTokens: usage?.summary?.lifetimeTokens ?? null,
  };
}

function print(result) {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Codex plan: ${result.planType}`);
  console.log(`Weekly usage: ${result.usedPercent}% used / ${result.elapsedPercent}% elapsed`);
  console.log(`Pace: ${result.paceMultiplier}x ${result.danger ? "(too fast)" : "(on track)"}`);
  console.log(`Reset: ${result.resetAt}`);
  console.log(`Projected limit: ${result.projectedLimitAt ?? "not projected"}`);
  console.log(`Reset credits: ${result.resetCreditsAvailable} available`);
  for (const item of result.resetStrategy.schedule) {
    console.log(
      item.neededBeforeNaturalReset
        ? `  #${item.credit}: use near 95% at ${item.idealAt}; latest ${item.latestAt}`
        : `  #${item.credit}: preserve for after the natural reset`,
    );
  }
  if (result.danger) {
    console.log(`Expected ${result.hoursBeforeReset}h before reset; slow down about ${result.recommendedSlowdownPercent}%.`);
  }
}

lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.id === 1 && message.result) {
    send({ method: "initialized", params: {} });
    send({ id: 2, method: "account/rateLimits/read", params: {} });
    send({ id: 3, method: "account/usage/read", params: {} });
    return;
  }

  if (message.id === 2) {
    if (message.error) return stop(1, message.error.message ?? "Rate-limit read failed.");
    rates = message.result;
  }

  if (message.id === 3) {
    if (message.error) return stop(1, message.error.message ?? "Usage read failed.");
    usage = message.result;
  }

  if (rates && usage) {
    try {
      print(calculate(rates));
      stop(0);
    } catch (error) {
      stop(1, error instanceof Error ? error.message : String(error));
    }
  }
});

child.on("error", (error) => stop(1, `Unable to start Codex App Server: ${error.message}`));
child.on("exit", (code) => {
  if (!finished) stop(code || 1, "Codex App Server exited before returning usage data.");
});

timer = setTimeout(() => stop(1, "Timed out waiting for Codex usage data."), timeoutMs);

send({
  id: 1,
  method: "initialize",
  params: {
    clientInfo: { name: "codex_pace_skill", title: "Codex Pace Skill", version: "1.0.0" },
    capabilities: { experimentalApi: true },
  },
});
