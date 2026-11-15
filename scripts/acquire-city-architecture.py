#!/usr/bin/env python3
"""Acquire a small, verified first batch of city architecture GLBs.

Input is the live discovery report. Binaries are staged as a CI artifact rather
than committed to Git, keeping the source repository and Unity checkout lean.
Every file is checked for CC0 metadata, size, GLB magic and non-empty content.
"""
import hashlib
import json
import pathlib
import time
import urllib.request

BASE = "https://3dassets.dev/api/v1"
INPUT = pathlib.Path("artifacts/city-architecture-candidates/nine-city-candidates.json")
OUT = pathlib.Path("artifacts/city-architecture-models")
MAX_BYTES = 25 * 1024 * 1024
PER_CITY = 2
UA = "UCENO-city-architecture-acquisition/1.0"

def request_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def unwrap_detail(payload):
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    if isinstance(payload, dict) and payload.get("slug"):
        return payload
    raise RuntimeError("Unexpected asset detail response; refusing to guess fields")

def get_license(detail):
    info = detail.get("license")
    if isinstance(info, str):
        return info.lower()
    if isinstance(info, dict):
        return str(info.get("id") or info.get("slug") or info.get("name") or "").lower()
    return ""

def main():
    if not INPUT.is_file():
        raise SystemExit(f"Missing discovery report: {INPUT}")
    report = json.loads(INPUT.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source": "https://3dassets.dev",
        "acquired_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "policy": "first-batch only; exact source record, CC0 licence metadata, <=25MiB and GLB header verified",
        "cities": {},
    }
    seen = set()
    failures = []
    for city, city_data in report.get("cities", {}).items():
        city_dir = OUT / city
        city_dir.mkdir(parents=True, exist_ok=True)
        acquired = []
        for candidate in city_data.get("candidates", []):
            slug = candidate.get("slug")
            if not slug or slug in seen or len(acquired) >= PER_CITY:
                continue
            try:
                detail = unwrap_detail(request_json(f"{BASE}/assets/{slug}"))
                licence = get_license(detail)
                if "cc0" not in licence and "cc0" not in json.dumps(detail.get("license", {})).lower():
                    raise ValueError(f"Licence metadata is not explicitly CC0: {licence or 'missing'}")
                url = detail.get("cdnUrl") or detail.get("cdn_url")
                if not isinstance(url, str) or not url.startswith("https://"):
                    raise ValueError("Asset detail has no HTTPS cdnUrl")
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=120) as response:
                    data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError(f"GLB exceeds 25 MiB ({len(data)} bytes)")
                if len(data) < 12 or data[:4] != b"glTF":
                    raise ValueError("Downloaded file does not have a GLB 2.0 header")
                digest = hashlib.sha256(data).hexdigest()
                filename = f"{slug}.glb"
                (city_dir / filename).write_bytes(data)
                acquired.append({
                    "slug": slug,
                    "name": detail.get("name") or detail.get("title") or candidate.get("name"),
                    "file": f"{city}/{filename}",
                    "bytes": len(data),
                    "sha256": digest,
                    "license": detail.get("license"),
                    "source_url": f"https://3dassets.dev/assets/{slug}",
                    "cdn_url": url,
                    "stats": detail.get("stats"),
                    "status": detail.get("status"),
                })
                seen.add(slug)
                print(f"ACQUIRED {city}/{filename} ({len(data)} bytes)")
            except Exception as exc:
                failures.append({"city": city, "slug": slug, "error": str(exc)})
                print(f"SKIP {city}/{slug}: {exc}")
        manifest["cities"][city] = acquired
        if not acquired:
            print(f"NO MODELS ACQUIRED for {city}")
    manifest["failures"] = failures
    manifest["total_models"] = sum(len(v) for v in manifest["cities"].values())
    (OUT / "acquisition-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Acquired {manifest['total_models']} GLB files across {len(manifest['cities'])} cities")
    if manifest["total_models"] == 0:
        raise SystemExit("No valid models acquired; failing rather than reporting success")
    if any(not models for models in manifest["cities"].values()):
        raise SystemExit("Partial city coverage: acquisition artifact retained for diagnosis, job marked failed")

if __name__ == "__main__":
    main()
