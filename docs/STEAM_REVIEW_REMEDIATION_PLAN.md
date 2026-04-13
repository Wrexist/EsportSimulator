# Steam Review Remediation Plan (BuildID 22405717)

## Blocking issues from Steam review
1. Potential third-party intellectual property in media/build content.
2. Missing gameplay description in Early Access section: **"What is the current state of the Early Access version?"**

## Immediate fixes before resubmission

### A) Remove third-party content
- Audit all store screenshots and trailer frames.
- Remove non-owned logos, teams, players, stream overlays, and scraped media.
- Replace with original gameplay captures and owned brand material only.

### B) Update Early Access "current state" text
Suggested text (edit to match implemented features exactly):

> **Current Early Access State (Build 22405717):**
> The current build includes the complete core gameplay loop: create and run an esports organization, recruit/train players, manage weekly schedules, budget/sponsors/facilities, scout talent, and progress through tournaments. Match simulation, tactical preparation, roster chemistry, and long-term progression are all playable in the current version. See **About This Game** for the full feature list.

## Repository hardening added
- `scripts/release-hardening-check.ts` now validates that image-path files in `public/assets` are not HTML/XML payloads.
- Known legacy contaminated portrait paths are allowlisted for now but must remain excluded from packaged Steam builds (`package.json > build.files`) until replaced with owned binaries.
- `scripts/steam-compliance-audit.ts` generates `tmp/steam-compliance-report.json` and fails on high-risk compliance findings.
- `config/steam-compliance-policy.json` centralizes trademark keyword scanning and legacy contaminated-asset allowlist.
- Run before upload:
  - `npm run lint`
  - `npm run type-check`
  - `npm test`
  - `npm run release:hardening`
  - `npm run compliance:steam`
  - `npm run compliance:steam:strict` (optional gate; fails on medium findings too)

## Store resubmission checklist
- [ ] Replace screenshots/trailer with owned media only.
- [ ] Update Early Access "current state" with gameplay details.
- [ ] Pass local build checks.
- [ ] Re-submit for Steam review.

## Optional Steam enhancements
- Add a Developer Recommended Controller Configuration.
- Evaluate Steam Remote Play support.

## Product roadmap: life simulator for iOS, Android, and Web
1. **Shared core engine:** keep simulation logic in shared TypeScript modules.
2. **Web target:** Next.js + cloud saves + account sync.
3. **Mobile target:** React Native/Expo shells using shared gameplay core.
4. **LiveOps:** feature flags, staged rollouts, and unified entitlement handling.
