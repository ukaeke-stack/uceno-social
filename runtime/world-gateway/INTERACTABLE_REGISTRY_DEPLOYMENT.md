# World interactable registry deployment

The gateway's authoritative interactable registry is generated from authored Unity scene objects. Do not enable strict registry mode until a real export has been produced, validated, and delivered to the gateway runtime.

## Generate the registry

1. Open `unity/UCENOVirtualWorld` in the configured Unity 6000.3 editor.
2. Run the scene build/export path used by `BuildCommand.PrepareAndroidBuild`, or use **UCENO / World / Export Scene Interactables to Gateway Registry** after all target scenes are loaded and saved.
3. The exporter validates stable scene IDs, non-trigger targeting colliders, door hinge pivots, and exactly-one district ownership.
4. It writes `runtime/world-gateway/config/world-interactables.json`. The JSON root must contain an `interactables` array. Each entry contains the stable object ID, kind, world position, and yaw. The gateway derives district ownership and initial state from its own configured policy.
5. Inspect the generated file and confirm it contains the expected real doors, seats, furniture, and usable objects. An empty or placeholder registry is not a valid release artifact.

The exporter also reads `runtime/world-gateway/config/world-districts.json`. Keep that district manifest aligned with the gateway's deployed district configuration and world bounds.

## Deliver the artifact to the gateway

The gateway Dockerfile copies `runtime/world-gateway/config` into the image at build time. Consequently, the generated `world-interactables.json` must exist in that directory **before** the gateway image is built. Alternatively, mount the exported file into the running container and point `WORLD_INTERACTABLES_FILE` at its absolute container path.

For a repository-based image build, include the verified generated JSON in the build context. For a mounted-file deployment, ensure the mount is available before the gateway starts and survives replacement/restart of the service. Do not assume a Unity Build Automation workspace automatically transfers its generated files to the separately deployed gateway service; that artifact transfer must be explicitly configured and verified.

Set `WORLD_INTERACTABLES_FILE` to the absolute path of the delivered JSON file. Do not rely on a relative path whose working directory may change between local and container execution.

## Strict startup mode

After the file is delivered and validated, set:

```env
WORLD_REQUIRE_INTERACTABLE_REGISTRY=true
```

With this flag enabled, the gateway refuses startup if no registry content is supplied. Invalid JSON, invalid entries, duplicate IDs, out-of-bounds coordinates, and district ownership errors are also rejected by the parser. Without the flag, a missing registry remains backward-compatible and loads an empty map; that mode is not evidence that scene interactions are configured.

## Release verification checklist

- [ ] Unity scene export completed successfully with all intended scenes loaded and saved.
- [ ] Export contains real authored interactables and stable `scene:` IDs.
- [ ] Exported coordinates fall within the configured world bounds and exactly one configured district.
- [ ] Exported file is present in the gateway image build context or mounted into the container.
- [ ] `WORLD_INTERACTABLES_FILE` resolves to that exact file inside the container.
- [ ] Gateway starts with `WORLD_REQUIRE_INTERACTABLE_REGISTRY=true` in a non-production verification environment.
- [ ] Gateway reports the expected registry count and real door/furniture interaction state changes are verified with connected Unity clients.
- [ ] Only after these checks should strict mode be enabled in production.

No production environment variable is changed by this documentation or by the source-level registry guard.