import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.resolve(process.env.SITES_RUNTIME_ROOT || path.join(projectRoot, ".sites-runtime"));
const isWindows = process.platform === "win32";

for (const directory of ["home", "npm-cache", "xdg-config", "tmp", "wrangler/logs"]) {
  await mkdir(path.join(runtimeRoot, directory), { recursive: true });
}

const env = {
  ...process.env,
  SITES_ENV_READY: "1",
  SITES_PROJECT_ROOT: projectRoot,
  HOME: path.join(runtimeRoot, "home"),
  XDG_CONFIG_HOME: path.join(runtimeRoot, "xdg-config"),
  TMPDIR: path.join(runtimeRoot, "tmp"),
  TEMP: path.join(runtimeRoot, "tmp"),
  TMP: path.join(runtimeRoot, "tmp"),
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler/logs"),
  MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler/registry"),
  npm_config_cache: path.join(runtimeRoot, "npm-cache"),
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
};
for (const key of ["NPM_CONFIG_CACHE", "npm_config_proxy", "npm_config_http_proxy", "npm_config_https_proxy", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTP_PROXY", "NPM_CONFIG_HTTPS_PROXY"]) delete env[key];

const duration = (value) => {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value);
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  return Number(match[1]) * { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2]];
};

const executable = (name) => path.join(projectRoot, "node_modules", ".bin", `${name}${isWindows ? ".cmd" : ""}`);

async function run(command, args, timeoutValue) {
  const usesCmdShim = isWindows && command.toLowerCase().endsWith(".cmd");
  const child = spawn(
    usesCmdShim ? process.env.ComSpec || "cmd.exe" : command,
    usesCmdShim ? ["/d", "/s", "/c", command, ...args] : args,
    { cwd: projectRoot, env, stdio: "inherit", windowsHide: true },
  );
  let timer;
  if (timeoutValue) {
    timer = setTimeout(() => {
      console.error(`Command exceeded ${timeoutValue}; terminating it.`);
      if (isWindows) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      else child.kill("SIGTERM");
    }, duration(timeoutValue));
  }
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
  }).finally(() => clearTimeout(timer));
  if (code !== 0) process.exit(code);
}

async function validate() {
  const workerPath = path.join(projectRoot, "dist/server/index.js");
  const hostingPath = path.join(projectRoot, "dist/.openai/hosting.json");
  for (const [file, label] of [[workerPath, "Sites Worker entry"], [hostingPath, "packaged Sites manifest"]]) {
    try { await access(file, constants.R_OK); } catch { throw new Error(`Missing ${label}: ${path.relative(projectRoot, file)}`); }
  }
  JSON.parse(await readFile(hostingPath, "utf8"));
  const fontDirectory = path.join(projectRoot, "dist/client/fonts/ui");
  const fonts = ["noto-sans-vietnamese.woff2", "noto-sans-latin-ext.woff2", "noto-sans-latin.woff2", "noto-serif-vietnamese.woff2", "noto-serif-latin-ext.woff2", "noto-serif-latin.woff2"];
  for (const name of fonts) {
    const font = await readFile(path.join(fontDirectory, name));
    if (font.length < 4 || font.subarray(0, 4).toString("ascii") !== "wOF2") throw new Error(`Invalid packaged WOFF2 font: ${name}`);
  }
  const url = pathToFileURL(workerPath); url.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
  const worker = await import(url.href);
  if (!worker.default || typeof worker.default.fetch !== "function") throw new Error("dist/server/index.js must export a default object with fetch(request, env, ctx)");
  console.log("Validated Sites artifact: Worker, hosting manifest, and UI fonts are present.");
}

const [action, ...args] = process.argv.slice(2);
if (action === "run") {
  if (!args.length) throw new Error("Usage: node scripts/sites.mjs run <local-command> [args...]");
  await run(executable(args[0]), args.slice(1));
} else if (action === "build") {
  await access(executable("vinext"), constants.R_OK).catch(() => { throw new Error("vinext is unavailable. Run npm run install:ci first."); });
  console.log("Running bounded vinext build...");
  await run(executable("vinext"), ["build"], process.env.SITES_BUILD_TIMEOUT || "3m");
  await validate();
} else if (action === "validate") {
  await validate();
} else if (action === "install") {
  const lockPath = path.join(projectRoot, "package-lock.json");
  const lockHash = createHash("sha256").update(await readFile(lockPath)).digest("hex");
  const lockMarker = path.join(runtimeRoot, "install.lock");
  try { await writeFile(lockMarker, String(process.pid), { flag: "wx" }); } catch { throw new Error("Another dependency install may already be running. Remove .sites-runtime/install.lock if it is stale."); }
  try {
    await run(isWindows ? "npm.cmd" : "npm", ["ci", "--cache", env.npm_config_cache], process.env.SITES_INSTALL_TIMEOUT || "8m");
    await access(executable("vinext"), constants.R_OK);
    await writeFile(path.join(projectRoot, "node_modules/.sites-install.json"), `${JSON.stringify({ lockfile_sha256: lockHash, node: process.version, platform: `${process.platform}-${process.arch}` }, null, 2)}\n`);
  } finally { await rm(lockMarker, { force: true }); }
  console.log("npm ci passed and vinext is available.");
} else {
  throw new Error("Usage: node scripts/sites.mjs <install|build|validate|run>");
}
