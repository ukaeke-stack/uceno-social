export function parseLinuxProcessStartTicks(stat) {
  if (typeof stat !== "string") return null;
  const closingParen = stat.lastIndexOf(")");
  if (closingParen < 0) return null;
  const fields = stat.slice(closingParen + 2).trim().split(/\s+/);
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
