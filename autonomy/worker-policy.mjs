export function parseLinuxProcessStartTicks(stat) {
  if (typeof stat !== "string") return null;
  const closingParen = stat.lastIndexOf(")");
  if (closingParen < 0) return null;
  const fields = stat.slice(closingParen + 2).trim().split(/\\s+/);
  return fields[19] || null;
}

export function reserveDailyCycle(state, now = new Date(), maxCycles = 24) {
  const day = now.toISOString().slice(0, 10);
  const current = state && typeof state === "object" ? { ...state } : {};
  if (current.day !== day) {
    current.day = day;
    current.cycles = 0;
  }
  current.cycles = Number.isInteger(current.cycles) && current.cycles >= 0 ? current.cycles : 0;
  current.completed = Number.isInteger(current.completed) ? current.completed : 0;
  current.failed = Number.isInteger(current.failed) ? current.failed : 0;
  current.lastCommit = current.lastCommit ?? null;
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
