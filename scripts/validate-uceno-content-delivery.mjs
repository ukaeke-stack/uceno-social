import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("unity/UCENOVirtualWorld/Packages/manifest.json"));
const delivery = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldContentDelivery.cs");
const architecture = read("docs/virtual-world/REMOTE_CONTENT_DELIVERY.md");
const tests = read("docs/virtual-world/REMOTE_CONTENT_DELIVERY_TESTS.md");

const checks = [
  ["Addressables package is declared", manifest.dependencies?.["com.unity.addressables"] === "2.7.6"],
  ["On-demand dependency size is checked", /GetDownloadSizeAsync\(label\)/.test(delivery)],
  ["Dependencies download asynchronously", /DownloadDependenciesAsync\(label, false\)/.test(delivery)],
  ["Download progress is exposed", /ProgressChanged\?\.Invoke\(label, download\.PercentComplete\)/.test(delivery)],
  ["Failures are retried", /attempt < maxAttempts/.test(delivery) && /WaitForSecondsRealtime/.test(delivery)],
  ["Successful labels are cached in session", /readyLabels\.Add\(label\)/.test(delivery)],
  ["Developer preload list exists", /preloadLabels/.test(delivery) && /PreloadConfiguredContent/.test(delivery)],
  ["Remote catalog is configurable", /remoteCatalogUrl/.test(delivery)],
  ["Architecture documents automatic loading and persistent cache", /automatically|on demand/i.test(architecture) && /persistent.*cache/i.test(architecture)),
  ["Acceptance tests cover interrupted downloads", /Interrupt the connection mid-download/.test(tests))
];

let failed = false;
for (const [name, passed] of checks) {
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
