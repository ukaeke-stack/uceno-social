## Remote content delivery acceptance tests

- [ ] Unity Package Manager resolves the pinned Addressables package in Unity 6000.3.27f1.
- [ ] The bootstrap initializes Addressables without a configured remote catalog for local Editor tests.
- [ ] A configured versioned HTTPS remote catalog loads successfully.
- [ ] After an authoritative home-entry transition, `WorldAreaContentBinding` automatically requests `home-interiors` and reports progress.
- [ ] After an authoritative event-venue transition, `WorldAreaContentBinding` automatically requests `world-event-venues` and reports progress.
- [ ] Successful downloads are cached and revisiting the same area does not download the same bundles again.
- [ ] Interrupt the connection mid-download; the current implementation reports a failure while the server-authorized area remains active. Verify that a subsequent visit retries and succeeds after connectivity returns.
- [ ] Verify the known limitation: downloads currently begin after server admission; do not treat this as a pre-transition loading gate.
- [ ] A missing label/catalog produces a clear error rather than a blank world or crash.
- [ ] Low-storage and HTTP errors are surfaced without marking the label ready.
- [ ] Developer preload downloads configured labels in sequence and is unavailable in release UI.
- [ ] A new catalog version updates content without requiring a full APK reinstall.
- [ ] Android and WebGL use separately built platform bundles.
- [ ] Measure initial APK size against the same build with world bundles included; record actual reduction rather than assuming a target.
- [ ] Verify asset quality and frame time in the same Android device profile; size reduction must not silently downgrade world visuals.
