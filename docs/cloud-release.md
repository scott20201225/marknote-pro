# Cloud Packaging

MarkNotePro ships a GitHub Actions build/release matrix for all desktop targets we currently package in CI:

- macOS Intel (`macos-15-intel`)
- macOS Apple Silicon (`macos-15`)
- Windows x64 (`windows-latest`)
- Windows arm64 (`windows-11-arm`)
- Linux x64 (`ubuntu-24.04`)
- Linux arm64 (`ubuntu-24.04-arm`)

Linux jobs publish every configured Electron Builder target for that architecture:

- `AppImage`
- `snap`
- `deb`
- `rpm`
- `tar.gz`

## Build artifacts without publishing a Release

Use the `PR Build` workflow:

1. Open `Actions`.
2. Select `PR Build`.
3. Click `Run workflow`.
4. Choose the branch and start the run.

The workflow uploads per-platform artifacts to the workflow run.

## Publish a GitHub Release

Use the `Release MarkNotePro` workflow in one of two ways:

1. Push a semver tag like `v0.20.0-beta.1`.
2. Or run `Release MarkNotePro` manually and provide an existing semver tag.

The release workflow:

- validates the tag,
- builds every CI platform target,
- uploads artifacts,
- generates `SHA256SUMS.txt`,
- creates/publishes the GitHub Release.

## Notes

- macOS builds are currently unsigned in CI.
- Linux artifact filenames include `${arch}` so x64 and arm64 outputs do not collide in one release.
