#!/usr/bin/env bash
set -euo pipefail

# Unity Build Automation runs this after Unity finishes and before it uploads
# the normal player artifacts. Register the scene registry as a separate,
# private, non-primary UBA artifact so it can be downloaded independently.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$REPO_ROOT/runtime/world-gateway/config"
REGISTRY="$CONFIG_DIR/world-interactables.json"
DISTRICTS="$CONFIG_DIR/world-districts.json"
API_ROOT="https://build-automation.services.api.unity.com/v2"

required=(ORG_ID PROJECT_ID BUILD_TARGET UCB_BUILD_NUMBER UCENO_UBA_SERVICE_ACCOUNT_KEY_ID UCENO_UBA_SERVICE_ACCOUNT_SECRET)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required Unity Build Automation setting: $name" >&2
    exit 2
  fi
done

if [[ ! -s "$REGISTRY" ]]; then
  echo "Scene registry is missing or empty: $REGISTRY" >&2
  echo "Configure UCENO.VirtualWorld.Editor.BuildCommand.PrepareAndroidBuild as the Pre-Export Method." >&2
  exit 3
fi
if [[ ! -s "$DISTRICTS" ]]; then
  echo "Gateway district manifest is missing or empty: $DISTRICTS" >&2
  exit 3
fi

node - "$REGISTRY" "$DISTRICTS" <<'NODE'
const fs = require("node:fs");
const [registryPath, districtsPath] = process.argv.slice(2);
const document = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const districtDocument = JSON.parse(fs.readFileSync(districtsPath, "utf8"));
if (!document || !Array.isArray(document.interactables) || document.interactables.length === 0) {
  throw new Error("world-interactables.json must contain a non-empty interactables array");
}
if (document.interactables.length > 500) {
  throw new Error("world-interactables.json exceeds the gateway limit of 500 interactables");
}
if (!districtDocument || !Array.isArray(districtDocument.districts) || districtDocument.districts.length === 0) {
  throw new Error("world-districts.json must contain a non-empty districts array");
}
const districts = districtDocument.districts;
const districtIds = new Set();
for (const district of districts) {
  if (!district || typeof district.id !== "string" || !district.id.trim() ||
      districtIds.has(district.id) ||
      ![district.minX, district.maxX, district.minZ, district.maxZ].every(Number.isFinite) ||
      district.minX >= district.maxX || district.minZ >= district.maxZ) {
    throw new Error("Invalid or duplicate gateway district definition");
  }
  districtIds.add(district.id);
}
const ids = new Set();
for (const item of document.interactables) {
  if (!item || typeof item.id !== "string" || !item.id.startsWith("scene:") ||
      !["door", "seat", "furniture", "vehicle", "object"].includes(item.kind) ||
      ![item.x, item.y, item.z, item.yaw].every(Number.isFinite) ||
      ids.has(item.id)) {
    throw new Error("Invalid or duplicate scene interactable entry");
  }
  const owners = districts.filter(district =>
    item.x >= district.minX && item.x < district.maxX &&
    item.z >= district.minZ && item.z < district.maxZ);
  if (owners.length !== 1) {
    throw new Error("Scene interactable must belong to exactly one configured gateway district: " + item.id);
  }
  ids.add(item.id);
}
console.log("Validated " + ids.size + " exported scene interactables against " + districts.length + " gateway districts");
NODE

command -v md5sum >/dev/null
command -v sha256sum >/dev/null
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
cp "$REGISTRY" "$tmp_dir/world-interactables.json"
(
  cd "$tmp_dir"
  sha256sum world-interactables.json > world-interactables.json.sha256
)

registry_size="$(wc -c < "$tmp_dir/world-interactables.json" | tr -d '[:space:]')"
registry_md5="$(md5sum "$tmp_dir/world-interactables.json" | awk '{print $1}')"
checksum_size="$(wc -c < "$tmp_dir/world-interactables.json.sha256" | tr -d '[:space:]')"
checksum_md5="$(md5sum "$tmp_dir/world-interactables.json.sha256" | awk '{print $1}')"

endpoint="$API_ROOT/orgs/$ORG_ID/projects/$PROJECT_ID/buildtargets/$BUILD_TARGET/builds/$UCB_BUILD_NUMBER/artifacts"
service_credentials="$(printf '%s:%s' "$UCENO_UBA_SERVICE_ACCOUNT_KEY_ID" "$UCENO_UBA_SERVICE_ACCOUNT_SECRET" | base64 | tr -d '\r\n')"
auth_header="Authorization: Basic $service_credentials"
artifact_body="$tmp_dir/artifact.json"
cat > "$artifact_body" <<JSON
{
  "name": "UCENO World Interactables Registry",
  "key": "uceno-world-interactables-registry",
  "primary": false,
  "public": false,
  "files": [
    {"filename":"world-interactables.json","size":$registry_size,"md5sum":"$registry_md5"},
    {"filename":"world-interactables.json.sha256","size":$checksum_size,"md5sum":"$checksum_md5"}
  ]
}
JSON

echo "Registering private UBA scene-registry artifact for build $UCB_BUILD_NUMBER"
curl --fail-with-body --silent --show-error \
  -X POST "$endpoint" \
  -H "$auth_header" -H "Content-Type: application/json" \
  --data-binary "@$artifact_body" \
  -o "$tmp_dir/create-response.json"

upload_file() {
  local filename="$1"
  local file_path="$2"
  local headers="$tmp_dir/$filename.headers"
  local location
  local upload_url

  curl --fail-with-body --silent --show-error \
    -D "$headers" -o "$tmp_dir/$filename.create-response" \
    -X POST "$endpoint/uceno-world-interactables-registry/upload/$filename" \
    -H "$auth_header" \
    -H "Tus-Resumable: 1.0.0" \
    -H "Upload-Length: $(wc -c < "$file_path" | tr -d '[:space:]')"

  location="$(awk 'BEGIN { IGNORECASE=1 } /^Location:/ { sub(/^[^:]*:[[:space:]]*/, ""); gsub("\\r", ""); print; exit }' "$headers")"
  if [[ -z "$location" ]]; then
    echo "UBA did not return a TUS Location for $filename" >&2
    cat "$tmp_dir/$filename.create-response" >&2
    exit 4
  fi

  if [[ "$location" == http://* || "$location" == https://* ]]; then
    upload_url="$location"
  elif [[ "$location" == /* ]]; then
    upload_url="https://build-automation.services.api.unity.com$location"
  else
    upload_url="$endpoint/$location"
  fi

  curl --fail-with-body --silent --show-error \
    -X PATCH "$upload_url" \
    -H "$auth_header" \
    -H "Tus-Resumable: 1.0.0" \
    -H "Upload-Offset: 0" \
    -H "Content-Type: application/offset+octet-stream" \
    --data-binary "@$file_path" \
    -o "$tmp_dir/$filename.upload-response"
  echo "Uploaded $filename"
}

upload_file "world-interactables.json" "$tmp_dir/world-interactables.json"
upload_file "world-interactables.json.sha256" "$tmp_dir/world-interactables.json.sha256"
echo "UBA scene-registry artifact upload completed. No gateway deployment was performed."
