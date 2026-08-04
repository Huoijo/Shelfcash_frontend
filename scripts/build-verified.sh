#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
if command -v timeout >/dev/null; then
  timeout \
    --signal=TERM \
    --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
    "${SITES_BUILD_TIMEOUT:-3m}" \
    "${vinext}" build
else
  echo "GNU timeout unavailable; using the portable Node.js build watchdog."
  node --input-type=module - \
    "${vinext}" \
    "${SITES_BUILD_TIMEOUT:-3m}" \
    "${SITES_BUILD_KILL_AFTER:-10s}" <<'NODE'
import { spawn } from "node:child_process";

const parseDuration = (value) => {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value);
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  const factors = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  return Number(match[1]) * factors[match[2]];
};

const [binary, timeoutValue, killAfterValue] = process.argv.slice(2);
const child = spawn(binary, ["build"], { stdio: "inherit" });
let timedOut = false;
let killTimer;
const timeoutTimer = setTimeout(() => {
  timedOut = true;
  console.error(`Build exceeded ${timeoutValue}; sending SIGTERM.`);
  child.kill("SIGTERM");
  killTimer = setTimeout(() => child.kill("SIGKILL"), parseDuration(killAfterValue));
}, parseDuration(timeoutValue));

child.once("error", (error) => {
  clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);
  console.error(error.message);
  process.exitCode = 69;
});
child.once("exit", (code, signal) => {
  clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);
  if (timedOut) process.exitCode = 124;
  else if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
NODE
fi

"${script_dir}/validate-artifact.sh"
