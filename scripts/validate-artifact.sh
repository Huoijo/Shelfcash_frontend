#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"
font_dir="${SITES_PROJECT_ROOT}/dist/client/fonts/ui"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${hosting}" "${font_dir}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, hostingPath, fontDirectory] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));

const requiredFonts = [
  "noto-sans-vietnamese.woff2",
  "noto-sans-latin-ext.woff2",
  "noto-sans-latin.woff2",
  "noto-serif-vietnamese.woff2",
  "noto-serif-latin-ext.woff2",
  "noto-serif-latin.woff2",
];

for (const fontName of requiredFonts) {
  const font = await readFile(`${fontDirectory}/${fontName}`);
  if (font.length < 4 || font.subarray(0, 4).toString("ascii") !== "wOF2") {
    throw new Error(`Invalid packaged WOFF2 font: ${fontName}`);
  }
}

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Sites artifact: Worker, hosting manifest, and UI fonts are present."
