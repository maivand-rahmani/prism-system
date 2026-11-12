# Legacy schema-5 manifest reader fixture

Unmodified snapshot of the manifest validator released with `@prism-system/tools`
5.0.0 (repository commit `890d3b4a63818b00fe188a226b3e30d8e854b576`). It is
test-only evidence that a shipped `schemaVersion: 5` manifest generated now is
still accepted by the validator consumers already have installed.

The permanent regression test imports this snapshot directly. It runs no git
command and never treats the repository's current `HEAD` as the released
reader, so later commits cannot move the compatibility baseline.

This snapshot predates the appended optional component names (`Popover` through
`FileDropzone`). It still accepts unchanged schema-5 manifests and fails closed
on a manifest that declares one of those newer names, so a system release that
adds them must be coordinated with an upgraded `@prism-system/tools` reader.

The three files are copied byte-for-byte with `git show` from:

```text
packages/tools/src/manifest.mjs
packages/tools/src/constants.mjs
packages/tools/src/semver.mjs
```

Do not edit them. Replace the snapshot only when intentionally raising the
oldest supported released reader, and record the new source commit here. The
fixture is never imported by production code.
