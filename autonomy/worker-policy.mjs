export function parseLinuxProcessStartTicks(stat) {
  if (typeof stat !== "string") return null;
  const closingParen = stat.lastIndexOf(")");
  if (closingParen < 0) return null;
  const fields = stat.slice(closingParen + 2).trim().split(/\s+/);
  return fields[19] || null;
}

export function isLiveWorkerLockOwner(owner, currentStartTicks, processExists) {
  if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
  if (typeof currentStartTicks === "string" && currentStartTicks.length > 0 &&
      typeof owner.startTicks === "string" && owner.startTicks.length > 0) {
    return currentStartTicks === owner.startTicks;
  }
  // /proc can be temporarily unreadable or the lock may predate start-time
  // fencing. Prefer a conservative false-positive over starting a second worker.
  return typeof processExists === "function" && processExists(owner.pid) === true;
}

export function validateWorkerState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("worker state must be a JSON object");
  }
  if (typeof state.day !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(state.day) ||
      new Date(state.day + "T00:00:00.000Z").toISOString().slice(0, 10) !== state.day) {
    throw new Error("worker state day is invalid");
  }
  for (const field of ["cycles", "completed", "failed"]) {
    if (!Number.isSafeInteger(state[field]) || state[field] < 0) {
      throw new Error("worker state " + field + " counter is invalid");
    }
  }
  if (state.lastCommit !== undefined && state.lastCommit !== null &&
      typeof state.lastCommit !== "string") {
    throw new Error("worker state lastCommit is invalid");
  }
  return { ...state, lastCommit: state.lastCommit ?? null };
}

export function reserveDailyCycle(state, now = new Date(), maxCycles = 24) {
  const day = now.toISOString().slice(0, 10);
  const current = validateWorkerState(state);
  if (current.day !== day) {
    current.day = day;
    current.cycles = 0;
  }
  if (current.cycles >= maxCycles) return { allowed: false, state: current };
  current.cycles += 1;
  return { allowed: true, state: current };
}

export function codexEnvironment(pathValue, apiKey) {
  return {
    PATH: pathValue || "",
    HOME: "/tmp/home",
    TMPDIR: "/tmp",
    OPENAI_API_KEY: apiKey
  };
}

export function gitAuthEnvironment(token) {
  if (typeof token !== "string" || token.length === 0) return {};
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: "AUTHORIZATION: basic " + Buffer.from("x-access-token:" + token).toString("base64")
  };
}

export function assertWorkBranch(branch, expectedBranch) {
  if (typeof branch !== "string" || branch !== expectedBranch || !/^[-A-Za-z0-9._/]+$/.test(branch)) {
    throw new Error("refusing Git operation outside the configured worker branch");
  }
  return branch;
}

export function buildPushRefspec(branch, expectedBranch) {
  return "HEAD:refs/heads/" + assertWorkBranch(branch, expectedBranch);
}

export function failureBackoffMs(failures, baseMs = 300000, maxMs = 3600000) {
  const count = Number.isInteger(failures) && failures > 0 ? failures : 1;
  return Math.min(maxMs, baseMs * (2 ** Math.min(count - 1, 20)));
}
