#!/usr/bin/env python3
"""Verify the nine committed city HDRI binaries against their provenance records.

This check proves file integrity and source metadata only. It does not claim
Unity import, texture settings, visual approval, or completed city art.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
from urllib.parse import urlparse

ROOT = pathlib.Path("unity/UCENOVirtualWorld/Assets/UCENO/Cities")
PROFILE = pathlib.Path("unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json")
EXPECTED_CITIES = {
    "solstice", "verdant", "nexus", "aurora", "saffron",
    "monsoon", "eclipse", "origin", "atlas",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(path: pathlib.Path, algorithm: str) -> str:
    hasher = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> None:
    profiles = json.loads(PROFILE.read_text(encoding="utf-8"))
    entries = profiles.get("cities", [])
    ids = [entry.get("cityId") for entry in entries]
    require(len(entries) == 9 and set(ids) == EXPECTED_CITIES and len(set(ids)) == 9,
            "City profile must contain exactly the nine non-Meridian city IDs")

    seen_assets: set[str] = set()
    for city in entries:
        city_id = city["cityId"]
        expected_path = f"Assets/UCENO/Cities/{city_id}/Textures/Skybox/{city_id}_environment.hdr"
        require(city.get("skyboxTexture") == expected_path,
                f"{city_id}: profile does not reference its exact city-owned HDRI path")
        folder = ROOT / city_id / "Textures" / "Skybox"
        provenance_path = folder / "hdri-provenance.json"
        hdri_path = folder / f"{city_id}_environment.hdr"
        require(provenance_path.is_file(), f"{city_id}: provenance record missing")
        require(hdri_path.is_file(), f"{city_id}: HDRI binary missing")

        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        asset_id = provenance.get("asset_id")
        require(provenance.get("city_id") == city_id, f"{city_id}: provenance city ID mismatch")
        require(isinstance(asset_id, str) and asset_id and asset_id not in seen_assets,
                f"{city_id}: missing or reused Poly Haven asset ID")
        seen_assets.add(asset_id)
        require(provenance.get("license") == "CC0 1.0", f"{city_id}: asset is not recorded as CC0 1.0")
        require(provenance.get("format") == "Radiance HDR (.hdr)", f"{city_id}: unsupported HDR format")
        require(provenance.get("resolution_tier") == "1k", f"{city_id}: expected 1k source tier")
        require(provenance.get("acquisition_status") == "downloaded-and-md5-verified",
                f"{city_id}: acquisition is not marked verified")

        page = urlparse(provenance.get("source_page", ""))
        download = urlparse(provenance.get("api_file_url", ""))
        require(page.scheme == "https" and page.netloc == "polyhaven.com" and page.path == f"/a/{asset_id}",
                f"{city_id}: source page does not match its Poly Haven asset ID")
        require(download.scheme == "https" and download.netloc == "dl.polyhaven.org" and
                download.path.endswith(f"/{asset_id}_1k.hdr"),
                f"{city_id}: untrusted or mismatched HDRI download URL")

        relative = hdri_path.as_posix()
        require(provenance.get("file") == relative,
                f"{city_id}: provenance file path does not match the committed binary")
        actual_size = hdri_path.stat().st_size
        require(actual_size > 0 and actual_size == provenance.get("expected_size_bytes") ==
                provenance.get("actual_size_bytes"), f"{city_id}: file size mismatch")
        actual_md5 = digest(hdri_path, "md5")
        actual_sha256 = digest(hdri_path, "sha256")
        require(actual_md5 == provenance.get("verified_md5"), f"{city_id}: MD5 mismatch")
        require(actual_sha256 == provenance.get("verified_sha256"), f"{city_id}: SHA-256 mismatch")

        with hdri_path.open("rb") as stream:
            header = stream.read(512)
        require(header.startswith((b"#?RADIANCE", b"#?RGBE")), f"{city_id}: not a Radiance HDR file")
        resolution = re.search(rb"(?m)^-Y\\s+(\\d+)\\s+\\+X\\s+(\\d+)\\s*$", header)
        require(resolution is not None, f"{city_id}: Radiance resolution header missing")
        height, width = map(int, resolution.groups())
        require(width >= 1024 and height >= 512 and 1.8 <= width / height <= 2.2,
                f"{city_id}: invalid panorama dimensions {width}x{height}")
        require(width == provenance.get("width") and height == provenance.get("height"),
                f"{city_id}: dimensions disagree with provenance")

        print(f"PASS {city_id}: {asset_id}, {width}x{height}, {actual_size} bytes, SHA-256 verified")

    require(len(seen_assets) == 9, "Expected nine unique HDRI source assets")
    print("PASS: all nine city HDRI files and provenance records are internally consistent.")
    print("NOTE: Unity import and visual acceptance remain separate release gates.")


if __name__ == "__main__":
    main()
