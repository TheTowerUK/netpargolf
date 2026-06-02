# Release Process

This is the baseline release flow for NetParGolf.

## 1) Prepare

- Ensure working tree is clean enough for release tagging.
- Confirm release scope and version/build targets.
- Run key local checks:
  - `npx tsc --noEmit`
  - regression scripts from `package.json` as needed

## 2) Source control

```bash
git add .
git commit -m "release: prepare <version>"
git push
```

## 3) Build (EAS)

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

Notes:
- iOS builds produce IPA artifacts for App Store Connect/TestFlight.
- Android builds produce AAB artifacts for Play Console tracks.

## 4) Submit

```bash
eas submit --platform ios --profile production
# Android submit can be enabled/configured when needed
```

## 5) Verify

- TestFlight/internal track smoke test:
  - app launch
  - core scoring flow
  - course setup flow
  - release-specific features/fixes
- Monitor crash/error reports if configured.

## 6) Record release

- Update `docs/releases/release-history.md` with:
  - version/build
  - date
  - major changes
  - notable risks/follow-ups
