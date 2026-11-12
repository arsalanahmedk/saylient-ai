import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const root = resolve(import.meta.dirname);
const out = resolve(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, "src"), out, { recursive: true });
await writeFile(resolve(out, "manifest.json"), JSON.stringify({
  manifest_version: 3,
  name: "Saylient AI — Communication Assistant",
  version: "0.1.0",
  description: "A local demo assistant for reviewing professional messages before sending.",
  permissions: ["storage", "activeTab"],
  host_permissions: ["http://localhost/*", "http://127.0.0.1/*"],
  web_accessible_resources: [{ resources: ["content.css"], matches: ["http://localhost/*", "http://127.0.0.1/*"] }],
  action: { default_title: "Open Saylient AI", default_popup: "popup.html" },
  background: { service_worker: "background.js" },
  content_scripts: [{ matches: ["http://localhost/*", "http://127.0.0.1/*"], js: ["content.js"], css: ["content.css"], run_at: "document_idle" }],
  icons: { "16": "icon.svg", "48": "icon.svg", "128": "icon.svg" }
}, null, 2));
for (const file of ["manifest.json", "background.js", "content.js", "content.css", "icon.svg", "popup.html", "popup.css", "popup.js"]) {
  await cp(resolve(out, file), resolve(root, file));
  await cp(resolve(out, file), resolve(root, "..", file));
}
console.log(`Built extension to ${out}`);
