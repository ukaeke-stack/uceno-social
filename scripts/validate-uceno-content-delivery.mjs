import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("unity/UCENOVirtualWorld/Packages/manifest.json"));
const delivery = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldContentDelivery.cs");
const areaBinding = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldAreaContentBinding.cs");
const gateway = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs");
const gatewayServer = read("runtime/world-gateway/src/server.ts");
const districtPolicy = read("runtime/world-gateway/src/district-policy.ts");
const districtTests = read("runtime/world-gateway/tests/district-policy.test.mjs");
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
  ["World-area binding auto-installs beside the gateway", /RuntimeInitializeOnLoadMethod/.test(areaBinding) && /WorldGatewayClient/.test(areaBinding)],
  ["Home transitions request interior content", /case "home": return "home-interiors"/.test(areaBinding)],
  ["Event transitions request venue content", /case "event": return "world-event-venues"/.test(areaBinding)],
  ["Area content binding reports progress and failures", /ProgressChanged/.test(areaBinding) && /ContentFailed/.test(areaBinding)],
  ["Home and event travel preload before sending admission", /PreloadBeforeSpatialTransition/.test(gateway) && /EnsureContent\(label/.test(gateway)],
  ["Travel request is gated on successful content download", /if \(!succeeded\)[\s\S]*?Travel cancelled/.test(gateway) && /SendSpatialContextAsync\(type, id\)/.test(gateway)],
  ["Failed preload does not send spatial admission", /Travel cancelled:[\s\S]*?spatialTransitionPending = false;[\s\S]*?yield break;/.test(gateway)],
  ["Transition feedback is visible", /spatialTransitionStatus/.test(gateway) && /private void OnGUI\(\)/.test(gateway)],
  ["Activity join preloads its content label", /PreloadBeforeActivityJoin/.test(gateway) && /EnsureContent\(label/.test(gateway)],
  ["Sports, racing, dance and adventure labels are mapped", /activity-sports/.test(gateway) && /activity-racing/.test(gateway) && /activity-dance/.test(gateway) && /activity-adventure/.test(gateway)],
  ["Server district boundaries are validated and non-overlapping", /parseWorldDistricts/.test(gatewayServer) && /overlap/.test(districtPolicy)],
  ["Server pauses movement pending district content acknowledgement without discarding direction input", /district_content_required/.test(gatewayServer) && /district_content_ready/.test(gatewayServer) && /Preserve the latest input intent/.test(gatewayServer)],
  ["District acknowledgement requires matching nonce and district", /msg\.districtId === pending\.id && msg\.nonce === pending\.nonce/.test(gatewayServer)],
  ["Client downloads server-selected district labels before acknowledgement", /district_content_required/.test(gateway) && /EnsureContent\(label/.test(gateway) && /district_content_ready/.test(gateway)),
  ["Client can retry and clears cancelled district transitions", /RetryPendingDistrictContent/.test(gateway) && /district_content_cancelled/.test(gateway)),
  ["District policy tests cover bounds and overlaps", /rejects overlapping district rectangles/.test(districtTests) && /rejects malformed JSON/.test(districtTests)),
  ["Architecture documents automatic loading and persistent cache", /automatically|on demand|preflight/i.test(architecture) && /persistent.*cache/i.test(architecture)],
  ["Acceptance tests cover interrupted downloads and district boundary gates", /Interrupt the connection mid-download/.test(tests) && /district boundary/.test(tests))
];

let failed = false;
for (const [name, passed] of checks) {
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
