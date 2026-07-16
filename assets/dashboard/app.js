const shell = document.querySelector(".shell");
const elements = Object.fromEntries(
  [
    "status", "headline", "subhead", "paceValue", "used", "elapsed", "target",
    "usageBar", "targetMarker", "projected", "projectedNote", "reset", "countdown",
    "recommendation", "dial", "dialValue", "credits", "resetPlan", "updated",
    "refresh", "alerts",
  ].map((id) => [id, document.getElementById(id)]),
);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let latestMetrics = null;
let alertsEnabled = "Notification" in window && Notification.permission === "granted";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function chooseLimit(response) {
  const byId = response?.rateLimitsByLimitId;
  return byId?.codex ?? (byId ? Object.values(byId)[0] : null) ?? response?.rateLimits ?? null;
}

function calculate(response) {
  const limit = chooseLimit(response);
  const windows = [limit?.primary, limit?.secondary].filter(Boolean);
  const weekly = [...windows].sort(
    (a, b) => (b.windowDurationMins ?? 0) - (a.windowDurationMins ?? 0),
  )[0];
  if (!weekly?.windowDurationMins || !weekly?.resetsAt) throw new Error("Incomplete Codex usage window.");

  const now = Date.now();
  const durationMs = weekly.windowDurationMins * 60_000;
  const resetMs = weekly.resetsAt * 1_000;
  const startMs = resetMs - durationMs;
  const elapsed = clamp((now - startMs) / durationMs, 0.01, 1);
  const used = clamp((weekly.usedPercent ?? 0) / 100, 0, 1);
  const pace = used / elapsed;
  const burnPerMs = used / Math.max(now - startMs, 1);
  const projectedMs = burnPerMs > 0 ? startMs + 1 / burnPerMs : null;
  const danger = projectedMs !== null && pace > 1.05 && projectedMs < resetMs;
  const slowdown = danger ? Math.max(0, Math.round((1 - 1 / pace) * 100)) : 0;
  const credits = Math.max(0, Number(response?.rateLimitResetCredits?.availableCount ?? 0));
  const schedule = [];

  if (burnPerMs > 0 && credits > 0) {
    const firstIdealMs = Math.max(now, startMs + 0.95 / burnPerMs);
    const cycleMs = 0.95 / burnPerMs;
    const bufferMs = 0.05 / burnPerMs;
    for (let index = 0; index < Math.min(credits, 10); index += 1) {
      const idealMs = firstIdealMs + index * cycleMs;
      schedule.push({
        credit: index + 1,
        idealMs,
        latestMs: idealMs + bufferMs,
        useful: idealMs < resetMs,
      });
    }
  }

  return {
    plan: limit?.planType ?? "Codex",
    used,
    elapsed,
    pace,
    projectedMs,
    resetMs,
    danger,
    slowdown,
    credits,
    schedule,
  };
}

function dateTime(timestamp) {
  if (!timestamp) return "Not projected";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function duration(timestamp) {
  const remaining = Math.max(0, timestamp - Date.now());
  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  const minutes = Math.floor((remaining % HOUR) / 60_000);
  return days ? `${days}d ${hours}h remaining` : `${hours}h ${minutes}m remaining`;
}

function render(metrics, generatedAt) {
  latestMetrics = metrics;
  shell.dataset.state = metrics.danger ? "danger" : "live";
  elements.status.lastChild.textContent = " Live";
  elements.paceValue.textContent = `${metrics.pace.toFixed(1)}×`;
  elements.used.textContent = `${Math.round(metrics.used * 100)}%`;
  elements.elapsed.textContent = `${(metrics.elapsed * 100).toFixed(1)}%`;
  elements.target.textContent = `${Math.round(metrics.elapsed * 100)}%`;
  elements.usageBar.style.width = `${metrics.used * 100}%`;
  elements.targetMarker.style.left = `${metrics.elapsed * 100}%`;
  elements.projected.textContent = dateTime(metrics.projectedMs);
  elements.reset.textContent = dateTime(metrics.resetMs);
  elements.countdown.textContent = duration(metrics.resetMs);
  elements.credits.textContent = String(metrics.credits);
  elements.updated.textContent = `Synced ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(generatedAt))}`;

  if (metrics.danger) {
    const earlyHours = Math.max(0, Math.round((metrics.resetMs - metrics.projectedMs) / HOUR));
    elements.headline.textContent = "Your pace is running hot.";
    elements.subhead.textContent = `At the current rate, the weekly allowance lands ${earlyHours} hours before its natural reset.`;
    elements.projectedNote.textContent = `${earlyHours}h before the natural reset`;
    elements.recommendation.textContent = `Slow down about ${metrics.slowdown}% to make the window.`;
    elements.dialValue.textContent = `−${metrics.slowdown}%`;
    elements.dial.style.setProperty("--dial", `${Math.min(100, metrics.slowdown)}%`);
  } else {
    elements.headline.textContent = "You’re on a sustainable pace.";
    elements.subhead.textContent = "Your current burn rate should carry through the weekly window.";
    elements.projectedNote.textContent = "No early exhaustion projected";
    elements.recommendation.textContent = "Keep roughly the same pace.";
    elements.dialValue.textContent = "1.0×";
    elements.dial.style.setProperty("--dial", `${Math.min(100, metrics.pace * 100)}%`);
  }

  const useful = metrics.schedule.filter((item) => item.useful);
  if (!metrics.credits) {
    elements.resetPlan.innerHTML = '<p class="empty">No reset credits are currently available.</p>';
  } else if (!useful.length) {
    elements.resetPlan.innerHTML = '<p class="empty">Preserve all credits for after the natural reset.</p>';
  } else {
    elements.resetPlan.replaceChildren(...useful.map((item) => {
      const row = document.createElement("div");
      row.className = "reset-row";
      row.innerHTML = `
        <span class="number">${item.credit}</span>
        <div><strong>Use near 95%</strong><span>${dateTime(item.idealMs)}</span></div>
        <div class="latest"><strong>Latest safe time</strong><span>${dateTime(item.latestMs)}</span></div>
      `;
      return row;
    }));
  }

  maybeNotify(metrics);
}

function renderError(message) {
  shell.dataset.state = "error";
  elements.status.lastChild.textContent = " Disconnected";
  elements.headline.textContent = "Live usage is unavailable.";
  elements.subhead.textContent = message;
}

async function refresh() {
  elements.refresh.disabled = true;
  elements.refresh.textContent = "…";
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Unable to sync Codex usage.");
    render(calculate(payload.rateLimits), payload.generatedAt);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Unable to sync Codex usage.");
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.textContent = "↻";
  }
}

function maybeNotify(metrics) {
  if (!alertsEnabled || !metrics.danger || Notification.permission !== "granted") return;
  const key = `codex-pace:${Math.round(metrics.projectedMs / HOUR)}`;
  if (localStorage.getItem("codex-pace-alert") === key) return;
  localStorage.setItem("codex-pace-alert", key);
  new Notification("Codex pace alert", {
    body: `At this pace, your weekly limit lands ${dateTime(metrics.projectedMs)}.`,
  });
}

elements.refresh.addEventListener("click", refresh);
elements.alerts.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    elements.alerts.textContent = "Alerts unavailable";
    return;
  }
  if (alertsEnabled) {
    alertsEnabled = false;
    elements.alerts.textContent = "Enable alerts";
    return;
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  alertsEnabled = permission === "granted";
  elements.alerts.textContent = alertsEnabled ? "Alerts enabled" : "Enable alerts";
  if (latestMetrics) maybeNotify(latestMetrics);
});

elements.alerts.textContent = alertsEnabled ? "Alerts enabled" : "Enable alerts";
refresh();
setInterval(refresh, 60_000);
setInterval(() => {
  if (latestMetrics) elements.countdown.textContent = duration(latestMetrics.resetMs);
}, 30_000);
