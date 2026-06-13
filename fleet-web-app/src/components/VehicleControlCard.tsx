"use client";

/**
 * Management card for a single selected vehicle:
 *  - live status (battery, charging, lock, location, online state, last seen)
 *  - command buttons (wake, lock, unlock, ready/enable-drive, refresh)
 *  - recent command logs from the backend
 *  - local-draft access scheduling (no backend endpoint yet)
 */

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ApiError,
  enableDriveVehicle,
  getVehicleLogs,
  getVehicleStatus,
  lockVehicle,
  readyVehicle,
  unlockVehicle,
  wakeVehicle,
  type CommandLogEntry,
  type Vehicle,
  type VehicleStatus,
} from "@/lib/api";
import {
  ACCESS_ACTION_LABELS,
  addSchedule,
  loadSchedules,
  removeSchedule,
  sortSchedules,
  type AccessAction,
  type AccessSchedule,
} from "@/lib/schedules";
import { StatusBadge } from "./StatusBadge";

/** Background status refresh cadence for selected vehicles. */
const AUTO_REFRESH_MS = 30_000;

type CommandKey = "wake" | "lock" | "unlock" | "ready" | "enable-drive";

type CommandFeedback = {
  kind: "success" | "error";
  text: string;
} | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function stateTone(state: string): "online" | "asleep" | "offline" | "neutral" {
  const s = state.toLowerCase();
  if (s === "online") return "online";
  if (s === "asleep") return "asleep";
  if (s === "offline") return "offline";
  return "neutral";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function VehicleControlCard({
  userId,
  vehicle,
}: {
  userId: string;
  vehicle: Vehicle;
}) {
  const vehicleId = vehicle.id;

  // ── Status ──
  const [status, setStatus] = useState<VehicleStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusVersion, setStatusVersion] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // ── Logs ──
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsVersion, setLogsVersion] = useState(0);

  // ── Commands ──
  const [activeCommand, setActiveCommand] = useState<CommandKey | null>(null);
  const [feedback, setFeedback] = useState<CommandFeedback>(null);

  // ── Schedules (local draft) ──
  const [schedules, setSchedules] = useState<AccessSchedule[]>([]);

  // Refs so the interval can read the latest values without resetting its
  // timer on every render / command.
  const mountedRef = useRef(true);
  const activeCommandRef = useRef<CommandKey | null>(activeCommand);
  useEffect(() => {
    activeCommandRef.current = activeCommand;
  }, [activeCommand]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Load live status. `background` refreshes (auto / tab-focus) keep the last
   * good data on failure so a transient error never wipes the card; only the
   * foreground load clears the card to show a full error + retry.
   */
  const loadStatus = useCallback(
    async (opts: { background: boolean }) => {
      try {
        const s = await getVehicleStatus(userId, vehicleId);
        if (!mountedRef.current) return;
        setStatus(s);
        setStatusError(null);
        setLastUpdated(new Date().toISOString());
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = errorMessage(err, "Could not load vehicle status.");
        setStatusError(msg);
        if (!opts.background) setStatus(null);
      } finally {
        if (mountedRef.current) setStatusLoading(false);
      }
    },
    [userId, vehicleId],
  );

  // Foreground load: initial mount + manual refresh/retry (via statusVersion).
  // Deferred a tick so no state update happens synchronously in the effect.
  useEffect(() => {
    const timer = window.setTimeout(
      () => void loadStatus({ background: false }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [loadStatus, statusVersion]);

  // Auto-refresh every 30s — only while the tab is visible and no command is
  // running. Also refreshes when the tab regains focus after being hidden.
  useEffect(() => {
    const canRefresh = () =>
      document.visibilityState === "visible" &&
      activeCommandRef.current === null;

    const interval = window.setInterval(() => {
      if (canRefresh()) void loadStatus({ background: true });
    }, AUTO_REFRESH_MS);

    const onVisibility = () => {
      if (canRefresh()) void loadStatus({ background: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadStatus]);

  // Load recent command logs (best-effort; backend may have none).
  useEffect(() => {
    let cancelled = false;
    getVehicleLogs(userId, vehicleId, 10)
      .then((rows) => {
        if (cancelled) return;
        setLogs(rows);
        setLogsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLogs([]);
        setLogsError(errorMessage(err, "Could not load command logs."));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, vehicleId, logsVersion]);

  // Load local draft schedules once on mount.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSchedules(sortSchedules(loadSchedules(userId, vehicleId))),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [userId, vehicleId]);

  function refreshStatus() {
    setStatusError(null);
    setStatusLoading(true);
    setStatusVersion((v) => v + 1);
  }

  async function runCommand(key: CommandKey) {
    if (activeCommand) return;

    // Confirmations for actions that physically open or move the car.
    if (key === "unlock" && !window.confirm(`Unlock ${vehicle.name}?`)) return;
    if (
      (key === "ready" || key === "enable-drive") &&
      !window.confirm(
        `${key === "ready" ? "Ready" : "Enable drive on"} ${vehicle.name}? This unlocks the car and makes it drivable.`,
      )
    ) {
      return;
    }

    setActiveCommand(key);
    setFeedback(null);
    try {
      switch (key) {
        case "wake":
          await wakeVehicle(userId, vehicleId);
          break;
        case "lock":
          await lockVehicle(userId, vehicleId);
          break;
        case "unlock":
          await unlockVehicle(userId, vehicleId);
          break;
        case "ready":
          await readyVehicle(userId, vehicleId);
          break;
        case "enable-drive":
          await enableDriveVehicle(userId, vehicleId);
          break;
      }
      setFeedback({ kind: "success", text: `${commandLabel(key)} sent.` });
      // Commands change state and produce a new log row — refresh both.
      setStatusVersion((v) => v + 1);
      setLogsVersion((v) => v + 1);
    } catch (err) {
      setFeedback({
        kind: "error",
        text: errorMessage(err, `${commandLabel(key)} failed.`),
      });
    } finally {
      setActiveCommand(null);
    }
  }

  const batteryText =
    status?.batteryLevel != null ? `${status.batteryLevel}%` : "—";
  const rangeText =
    status?.rangeKm != null ? `${Math.round(status.rangeKm)} km` : null;

  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-desat-2 bg-white p-6">
      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative h-12 w-20 shrink-0">
            <Image
              src={vehicle.image}
              alt={vehicle.name}
              fill
              sizes="80px"
              className="object-contain"
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-accent-dark">
              {vehicle.name}
            </h3>
            {vehicle.vin && (
              <p className="truncate font-mono text-xs text-desat-7">
                {vehicle.vin}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {status && (
            <StatusBadge
              label={status.state || "unknown"}
              tone={stateTone(status.state)}
            />
          )}
          {status?.isLocked != null && (
            <StatusBadge
              label={status.isLocked ? "Locked" : "Unlocked"}
              tone={status.isLocked ? "locked" : "unlocked"}
            />
          )}
        </div>
      </header>

      {/* ── Status grid ── */}
      <section>
        {statusLoading && status === null ? (
          <p className="text-sm text-desat-7">Loading status…</p>
        ) : status === null && statusError ? (
          // No data at all — show a full error with retry.
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{statusError}</span>
            <button
              type="button"
              onClick={refreshStatus}
              className="ml-3 font-medium underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Stale-data note: keep showing last good status on a failed
                background refresh instead of wiping the card. */}
            {statusError && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>Couldn&apos;t refresh: {statusError}</span>
                <button
                  type="button"
                  onClick={refreshStatus}
                  className="ml-3 font-medium underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Stat label="Battery" value={batteryText} hint={rangeText ?? undefined} />
              <Stat
                label="Charging"
                value={status?.chargingState ?? "—"}
              />
              <Stat
                label="Lock"
                value={
                  status?.isLocked == null
                    ? "—"
                    : status.isLocked
                    ? "Locked"
                    : "Unlocked"
                }
              />
              <Stat
                label="Location"
                value={
                  status?.lastLat != null && status?.lastLng != null
                    ? `${status.lastLat.toFixed(4)}, ${status.lastLng.toFixed(4)}`
                    : "—"
                }
              />
              <Stat
                label="Inside temp"
                value={status?.insideTemp != null ? `${status.insideTemp}°` : "—"}
              />
              <Stat label="Last seen" value={formatTime(status?.lastSeenAt ?? null)} />
            </dl>
          </>
        )}
        <p className="mt-3 text-xs text-desat-7">
          Last refreshed: {formatTime(lastUpdated)}
          <span className="ml-1">· auto-refreshes every 30s</span>
        </p>
      </section>

      {/* ── Command feedback ── */}
      {feedback && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            feedback.kind === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {/* ── Command buttons ── */}
      <section className="flex flex-wrap gap-2">
        <CommandButton
          label="Wake"
          busy={activeCommand === "wake"}
          disabled={activeCommand !== null}
          onClick={() => runCommand("wake")}
        />
        <CommandButton
          label="Lock"
          busy={activeCommand === "lock"}
          disabled={activeCommand !== null}
          onClick={() => runCommand("lock")}
        />
        <CommandButton
          label="Unlock"
          busy={activeCommand === "unlock"}
          disabled={activeCommand !== null}
          onClick={() => runCommand("unlock")}
        />
        <CommandButton
          label="Enable drive"
          busy={activeCommand === "enable-drive"}
          disabled={activeCommand !== null}
          onClick={() => runCommand("enable-drive")}
        />
        <CommandButton
          label="Ready"
          busy={activeCommand === "ready"}
          disabled={activeCommand !== null}
          onClick={() => runCommand("ready")}
          primary
        />
        <CommandButton
          label="Refresh status"
          busy={statusLoading}
          disabled={activeCommand !== null}
          onClick={refreshStatus}
          variant="ghost"
        />
      </section>

      {/* ── Recent logs ── */}
      <RecentLogs
        logs={logs}
        error={logsError}
        onRetry={() => setLogsVersion((v) => v + 1)}
      />

      {/* ── Scheduling (local draft) ── */}
      <SchedulePanel
        userId={userId}
        vehicleId={vehicleId}
        schedules={schedules}
        onChange={setSchedules}
      />
    </article>
  );
}

function commandLabel(key: CommandKey): string {
  switch (key) {
    case "wake":
      return "Wake";
    case "lock":
      return "Lock";
    case "unlock":
      return "Unlock";
    case "ready":
      return "Ready";
    case "enable-drive":
      return "Enable drive";
  }
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-desat-7">{label}</dt>
      <dd className="text-sm font-medium capitalize text-accent-dark">
        {value}
        {hint && <span className="ml-1 text-xs text-desat-7">({hint})</span>}
      </dd>
    </div>
  );
}

function CommandButton({
  label,
  busy,
  disabled,
  onClick,
  primary,
  variant,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
  variant?: "ghost";
}) {
  const base =
    "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50";
  const style = primary
    ? "bg-accent-primary text-white hover:opacity-90"
    : variant === "ghost"
    ? "text-accent-dark hover:bg-desat-1"
    : "border border-desat-3 text-accent-dark hover:bg-desat-1";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${style}`}
    >
      {busy ? "…" : label}
    </button>
  );
}

function RecentLogs({
  logs,
  error,
  onRetry,
}: {
  logs: CommandLogEntry[];
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="border-t border-desat-2 pt-4">
      <h4 className="mb-2 text-sm font-bold text-accent-dark">
        Recent activity
      </h4>
      {error ? (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="ml-3 font-medium underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-desat-7">No commands recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {logs.map((log) => {
            const ok = log.result?.toLowerCase() === "success";
            return (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block size-2 shrink-0 rounded-full ${
                      ok ? "bg-success" : "bg-red-500"
                    }`}
                  />
                  <span className="font-medium capitalize text-accent-dark">
                    {log.command.replace(/-/g, " ")}
                  </span>
                  {!ok && log.errorMessage && (
                    <span className="text-xs text-red-600">
                      {log.errorMessage}
                    </span>
                  )}
                </span>
                <time className="shrink-0 text-xs text-desat-7">
                  {formatTime(log.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SchedulePanel({
  userId,
  vehicleId,
  schedules,
  onChange,
}: {
  userId: string;
  vehicleId: string;
  schedules: AccessSchedule[];
  onChange: (next: AccessSchedule[]) => void;
}) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [durationHours, setDurationHours] = useState("1");
  const [action, setAction] = useState<AccessAction>("unlock");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    const next = addSchedule(userId, vehicleId, {
      date,
      startTime,
      durationHours: Number(durationHours) || 1,
      action,
      notes: notes.trim(),
    });
    onChange(next);
    setNotes("");
  }

  function handleRemove(id: string) {
    onChange(removeSchedule(userId, vehicleId, id));
  }

  const inputClass =
    "rounded-lg border border-desat-3 px-3 py-2 text-sm text-accent-dark outline-none focus:border-accent-primary";

  return (
    <section className="border-t border-desat-2 pt-4">
      <div className="mb-1 flex items-center gap-2">
        <h4 className="text-sm font-bold text-accent-dark">Scheduled access</h4>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
          Local draft
        </span>
      </div>
      <p className="mb-3 text-xs text-desat-7">
        Saved on this device only — not yet enforced by the backend.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-desat-7">Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-desat-7">Start</span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-desat-7">Hours</span>
            <input
              type="number"
              min={1}
              max={24}
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-desat-7">Action</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as AccessAction)}
              className={inputClass}
            >
              {(Object.keys(ACCESS_ACTION_LABELS) as AccessAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACCESS_ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-desat-7">Notes</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cleaning crew access"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="self-start rounded-lg bg-accent-dark px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Save schedule
        </button>
      </form>

      {schedules.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-desat-1 px-3 py-2"
            >
              <div className="text-sm">
                <p className="font-medium text-accent-dark">
                  {s.date} at {s.startTime} · {s.durationHours}h
                </p>
                <p className="text-xs text-desat-7">
                  {ACCESS_ACTION_LABELS[s.action]}
                  {s.notes ? ` — ${s.notes}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s.id)}
                className="shrink-0 text-xs font-medium text-red-600 underline-offset-2 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
