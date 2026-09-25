// Reruns build.mjs when the inputs change. Spawns a child rather than calling
// the builder in-process, because build.mjs reads data/ at module load and a
// fresh process is the only way to pick up changes without restructuring it.
// Watches data/, template.html and scripts/deck.js. Ctrl+C to stop.
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const builder = join(root, "scripts", "build.mjs");

let queued = null;
let running = false;
let again = false;

function build(reason) {
  if (running) { again = true; return; }
  running = true;
  const t = Date.now();
  const child = spawn(process.execPath, [builder], { stdio: "inherit" });
  child.on("exit", (code) => {
    running = false;
    const ms = Date.now() - t;
    console.log(code === 0 ? `  ${reason} -> rebuilt in ${ms}ms\n` : `  ${reason} -> build failed (exit ${code})\n`);
    if (again) { again = false; build("queued change"); }
  });
}

// fs.watch fires two or three times for one save on Windows, so coalesce.
function schedule(reason) {
  clearTimeout(queued);
  queued = setTimeout(() => build(reason), 120);
}

const targets = [
  { path: join(root, "data"), label: "data/", opts: { recursive: true } },
  { path: join(root, "template.html"), label: "template.html", opts: {} },
  { path: join(root, "scripts", "deck.js"), label: "scripts/deck.js", opts: {} }
];

for (const t of targets) {
  try {
    watch(t.path, t.opts, (_event, file) => schedule(file ? String(file) : t.label));
  } catch (e) {
    console.warn(`! cannot watch ${t.label}: ${e.message}`);
  }
}

console.log("Watching data/, template.html and scripts/deck.js. Ctrl+C to stop.");
build("initial");
