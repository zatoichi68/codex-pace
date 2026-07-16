#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const MAX_PORT = 3010;
const CACHE_MS = 60_000;
const RPC_TIMEOUT_MS = 15_000;
const shouldOpen = process.argv.includes("--open");
const requestedPort = readPort(process.argv) ?? Number(process.env.CODEX_PACE_PORT ?? DEFAULT_PORT);
const assetRoot = fileURLToPath(new URL("../assets/dashboard/", import.meta.url));
const allowedMethods = new Set(["account/rateLimits/read", "account/usage/read"]);
const assetMap = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

let codex = null;
let lines = null;
let initialized = false;
let appServerStatus = "connecting";
let nextRpcId = 10;
let lastSnapshot = null;
let lastSnapshotAt = 0;
let shuttingDown = false;
const pending = new Map();

function readPort(argv) {
  const index = argv.indexOf("--port");
  if (index === -1) return null;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("--port must be a valid TCP port.");
  }
  return value;
}

function send(payload) {
  if (!codex?.stdin.writable) throw new Error("Codex App Server is not available.");
  codex.stdin.write(`${JSON.stringify(payload)}\n`);
}

function startCodex() {
  codex = spawn("codex", ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "ignore"],
    env: process.env,
  });
  lines = readline.createInterface({ input: codex.stdout });

  lines.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message.id === 1 && message.result) {
      send({ method: "initialized", params: {} });
      initialized = true;
      appServerStatus = "ready";
      return;
    }

    if (typeof message.id === "number" && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message ?? "Codex request failed."));
      else request.resolve(message.result);
      return;
    }

    if (message.method === "account/rateLimits/updated") {
      const update = message.params?.rateLimits;
      const current = lastSnapshot?.rateLimits;
      if (update && current?.rateLimits) {
        const limitId = update.limitId;
        const byId = limitId && current.rateLimitsByLimitId
          ? {
              ...current.rateLimitsByLimitId,
              [limitId]: { ...current.rateLimitsByLimitId[limitId], ...update },
            }
          : current.rateLimitsByLimitId;
        lastSnapshot = {
          ...lastSnapshot,
          rateLimits: {
            ...current,
            rateLimits: { ...current.rateLimits, ...update },
            rateLimitsByLimitId: byId,
          },
          generatedAt: new Date().toISOString(),
        };
        lastSnapshotAt = Date.now();
      } else {
        lastSnapshotAt = 0;
      }
    }
  });

  codex.on("error", () => {
    appServerStatus = "error";
  });
  codex.on("exit", () => {
    initialized = false;
    appServerStatus = shuttingDown ? "stopped" : "disconnected";
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Codex App Server disconnected."));
    }
    pending.clear();
  });

  send({
    id: 1,
    method: "initialize",
    params: {
      clientInfo: {
        name: "codex_pace_companion",
        title: "Codex Pace Companion",
        version: "1.0.0",
      },
      capabilities: { experimentalApi: true },
    },
  });
}

function rpc(method) {
  if (!allowedMethods.has(method)) return Promise.reject(new Error("Method not allowed."));
  if (!initialized) return Promise.reject(new Error("Codex App Server is still connecting."));

  return new Promise((resolve, reject) => {
    const id = nextRpcId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Codex request timed out."));
    }, RPC_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    send({ id, method, params: {} });
  });
}

async function snapshot() {
  if (lastSnapshot && Date.now() - lastSnapshotAt < CACHE_MS) return lastSnapshot;
  const [rateLimits, usage] = await Promise.all([
    rpc("account/rateLimits/read"),
    rpc("account/usage/read"),
  ]);
  lastSnapshot = { rateLimits, usage, generatedAt: new Date().toISOString() };
  lastSnapshotAt = Date.now();
  return lastSnapshot;
}

function isLocalRequest(request) {
  const host = String(request.headers.host ?? "").toLowerCase();
  const origin = String(request.headers.origin ?? "").toLowerCase();
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host);
  const localOrigin = !origin || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);
  return localHost && localOrigin;
}

function json(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function createCompanionServer() {
  return createServer(async (request, response) => {
    if (!isLocalRequest(request)) {
      json(response, 403, { error: "Local requests only." });
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (request.method !== "GET") {
      json(response, 405, { error: "Read-only endpoint." });
      return;
    }

    if (url.pathname === "/api/health") {
      json(response, 200, {
        ok: true,
        app: "codex-pace-companion",
        status: appServerStatus,
      });
      return;
    }

    if (url.pathname === "/api/snapshot") {
      try {
        json(response, 200, await snapshot());
      } catch (error) {
        json(response, initialized ? 502 : 503, {
          error: error instanceof Error ? error.message : "Unable to read Codex usage.",
          status: appServerStatus,
        });
      }
      return;
    }

    const asset = assetMap.get(url.pathname);
    if (!asset) {
      json(response, 404, { error: "Not found." });
      return;
    }

    try {
      const [name, type] = asset;
      const body = await readFile(new URL(name, `file://${assetRoot}/`));
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'",
        "Content-Type": type,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch {
      json(response, 500, { error: "Dashboard asset unavailable." });
    }
  });
}

async function probe(port) {
  try {
    const response = await fetch(`http://${HOST}:${port}/api/health`, {
      signal: AbortSignal.timeout(750),
    });
    const body = await response.json();
    return response.ok && body.app === "codex-pace-companion";
  } catch {
    return false;
  }
}

async function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

function openBrowser(url) {
  if (!shouldOpen) return;
  const command = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  const opener = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
  opener.unref();
}

async function main() {
  for (let port = requestedPort; port <= Math.max(requestedPort, MAX_PORT); port += 1) {
    if (await probe(port)) {
      const url = `http://localhost:${port}`;
      console.log(`Codex Pace companion already running: ${url}`);
      openBrowser(url);
      return;
    }
  }

  const server = createCompanionServer();
  let port = requestedPort;
  while (port <= Math.max(requestedPort, MAX_PORT)) {
    try {
      await listen(server, port);
      break;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" || port === Math.max(requestedPort, MAX_PORT)) throw error;
      port += 1;
    }
  }

  startCodex();
  const url = `http://localhost:${port}`;
  console.log(`Codex Pace companion: ${url}`);
  console.log("Press Ctrl+C to stop.");
  openBrowser(url);

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    lines?.close();
    codex?.kill("SIGTERM");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
