import { spawn } from "node:child_process";

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.cleanEnv ? options.env : { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: Boolean(options.timeout)
    });
    let stdout = "", stderr = "";
    let timedOut = false;
    let killTimer = null;
    let killPromise = null;
    const signalGroup = signal => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); }
      catch { try { child.kill(signal); } catch {} }
    };
    const timer = options.timeout ? setTimeout(() => {
      timedOut = true;
      signalGroup("SIGTERM");
      // Keep the process-group kill alive even if the direct child exits first:
      // grandchildren may ignore SIGTERM and otherwise outlive the worker cycle.
      killPromise = new Promise(done => {
        killTimer = setTimeout(() => {
          signalGroup("SIGKILL");
          done();
        }, options.killGraceMs || 10000);
      });
    }, options.timeout) : null;
    child.stdout.on("data", data => { stdout += data.toString(); });
    child.stderr.on("data", data => { stderr += data.toString(); });
    child.on("error", async error => {
      if (timer) clearTimeout(timer);
      if (killPromise) await killPromise;
      reject(error);
    });
    child.on("close", async code => {
      if (timer) clearTimeout(timer);
      if (killPromise) await killPromise;
      if (killTimer) clearTimeout(killTimer);
      resolve({ code: timedOut ? 124 : (code ?? 1), stdout, stderr, timedOut });
    });
  });
}
