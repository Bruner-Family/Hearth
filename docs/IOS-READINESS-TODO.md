# Hearth iOS Readiness TODO

Status: proposed  
Last reviewed: 2026-07-27  
Scope: product improvements and the path from the current Expo web/PWA app to
a dependable iPhone application.

## Outcome

Hearth already has the right foundation for iOS: Expo Router, React Native
components, an iOS bundle identifier and URL scheme, mobile-oriented tabs,
Supabase Auth/RLS, private attachment storage, and shared TypeScript business
logic. This is an iOS hardening and release project, not a rewrite.

The first native milestone should be a family-only TestFlight build. A public
App Store release should follow only after authentication, data recovery,
privacy, accessibility, and account lifecycle work have been exercised by
real household members.

## Priority definitions

- **P0**: required before the first TestFlight build is useful or safe.
- **P1**: required before a public App Store submission.
- **P2**: high-value mobile product work after the native foundation is stable.
- **P3**: later differentiation and scale work.

## P0: Make the native app function correctly

### Authentication and app lifecycle

- [ ] **Complete the native Pocket-ID OAuth flow.**
  - Current evidence: `src/lib/auth.tsx` supplies `hearth://` as a redirect,
    but it does not open an auth session on native or exchange the returned
    authorization code for a Supabase session. `detectSessionInUrl` is disabled
    on native, so `signInWithOAuth()` alone cannot finish sign-in.
  - Open the authorization URL with the platform auth-session browser, handle
    cancellation and provider errors, exchange the returned code, and close the
    browser cleanly.
  - Register development and production redirect URLs in Supabase and
    Pocket-ID. Use a dedicated callback route instead of the app root.
  - **Done when:** sign-in, app restart, token refresh, sign-out, cancelled
    sign-in, and expired-session recovery work on a physical iPhone.

- [ ] **Harden native session persistence and refresh.**
  - Evaluate secure storage for refresh/session material rather than plain
    AsyncStorage.
  - Start and stop Supabase automatic refresh with React Native `AppState`.
  - Add a session-expired state that returns the user to sign-in without
    presenting stale household data.
  - **Done when:** backgrounding overnight and returning to the app succeeds,
    and revoked sessions fail closed with a clear message.

- [ ] **Verify every deep-link entry point while signed in and signed out.**
  - Cover `/items/:id`, log forms, schedule completion, invitation acceptance,
    and future notification/QR links.
  - Preserve the intended destination through authentication.
  - **Done when:** cold-start, warm-start, and post-auth links route to the same
    intended screen.

### Native inputs, files, and interaction

- [ ] **Replace native text date entry with an iOS date/month picker.**
  - Current evidence: `src/components/DateField.tsx` falls back to a raw
    `YYYY-MM-DD` or `YYYY-MM` text field outside the web build.
  - Preserve the existing month-only purchase-date precision.
  - **Done when:** all item, log, warranty, and schedule dates are keyboard-free,
    locale-aware to display, and continue to store ISO values.

- [ ] **Finish native attachment capture.**
  - Done on web: `expo-document-picker` for PDF receipts, manuals, and
    warranties; file names on non-image thumbs; a named 10 MiB rejection
    before upload. Still needs verification on device.
  - Show upload progress — the picker-to-uploaded gap is currently a spinner
    with no indication of how far along a large file is.
  - Downscale large camera photos before upload and verify HEIC behavior.
  - Add explicit, human-readable camera and photo-library permission copy in
    app configuration.
  - **Done when:** camera, photo library, Files, cancellation, denied
    permissions, 10 MiB rejection, slow upload, and retry all behave clearly.

- [ ] **Make attachment writes failure-safe.**
  - Current evidence: `useUploadAttachment` now removes the object it just
    wrote if the row insert fails, and `useDeleteItem` / `useDeleteLog` purge
    storage before the cascade. Still open: delete removes the row first and
    ignores a later storage-delete error, and a compensating cleanup that
    itself fails leaves an object with nothing left to reconcile it against.
  - Move the multi-step writes server-side, or record/reconcile orphaned
    objects.
  - Done: object names carry a random suffix alongside `Date.now()`, and file
    names are sanitized before use in paths (`src/lib/attachments.ts`).
  - **Done when:** forced failure at each step leaves either a complete
    attachment or no attachment, never an undiscoverable private object.

- [ ] **Add native share/export behavior.**
  - Keep browser download for web and use the iOS share sheet for CSV and
    future reports.
  - **Done when:** an inventory export can be saved to Files, AirDropped, or
    shared from an iPhone.

### Reliability and data safety

- [ ] **Render query errors distinctly from empty states.**
  - Current evidence: several screens default failed queries to empty arrays.
    A network, auth, or Supabase failure can therefore look like an empty home.
  - Add a reusable full-screen/inline error state with retry and preserve cached
    data when available.
  - **Done when:** offline, 401, timeout, and server errors never imply that
    household data was deleted.

- [ ] **Add connectivity-aware refresh and basic offline reading.**
  - Wire TanStack Query focus/online state to React Native app and network
    lifecycle.
  - Persist the last successful read cache for items, logs, schedules, and
    reference details. Clearly label stale/offline data.
  - Start with read-only offline behavior. Queueing writes can wait until its
    conflict semantics are designed.
  - Add pull-to-refresh to Home, Items, Schedules, and Settings.
  - **Done when:** Hearth remains useful in a basement with poor reception and
    never silently discards a form submission.

- [ ] **Protect unsaved forms and duplicate submissions.**
  - Warn before navigating away from dirty forms.
  - Make create/complete operations idempotent or otherwise resistant to
    repeated taps and network retries.
  - Preserve form values after recoverable failures.
  - **Done when:** interruption, backgrounding, and retry do not lose work or
    create duplicate logs/schedules.

- [ ] **Close the existing server-managed-column authorization gap.**
  - Enforce immutability of `created_by`, `created_at`, tenant/parent IDs, and
    equivalent server-owned fields with database privileges, triggers, or
    narrowly scoped policies.
  - Extend pgTAP coverage to direct PostgREST-style tampering.
  - **Done when:** an authenticated client cannot rewrite audit or ownership
    columns even by bypassing the app.

### Build and test foundation

- [ ] **Create native build profiles and environments.**
  - Add an Expo/EAS project association and `eas.json` profiles for simulator
    development, physical-device preview, and production.
  - Separate development/staging and production Supabase/Pocket-ID redirect
    configuration. Do not put service secrets in `EXPO_PUBLIC_*` values.
  - Decide whether production updates will use store-only releases or an
    explicitly configured over-the-air update policy.
  - **Done when:** a repeatable clean build produces a signed preview installed
    on a physical iPhone.

- [ ] **Add a native CI lane.**
  - Keep typecheck, lint, unit, RLS, Edge Function, and web export checks.
  - Add iOS bundle/export validation, Expo dependency/config validation, and a
    smoke test that boots the main routes.
  - Add automated end-to-end coverage for sign-in callback, add/edit/delete
    item, add/edit/delete log, complete schedule, switch household, and attach
    a photo.
  - **Done when:** a pull request cannot merge with a broken native bundle or
    broken critical journey.

- [ ] **Run a physical-device compatibility pass.**
  - Cover at least the oldest supported iOS major version and the current
    version, small and large iPhones, light/dark mode, increased text size,
    reduced motion, VoiceOver, poor network, and denied permissions.
  - **Done when:** results are captured in a repeatable release checklist.

## P1: Prepare for App Store review and public use

### Account, household, and privacy lifecycle

- [ ] **Design and implement in-app account deletion.**
  - Define how deletion behaves for a sole household owner, an owner with other
    members, and a regular member.
  - Include auth identity, profile/membership, owned household data, database
    records, attachments, notification tokens, and backups/retention language.
  - Require a clear destructive confirmation and provide a completion status.
  - **Done when:** a user can initiate deletion from Settings without emailing
    an administrator, and the result matches the published retention policy.

- [ ] **Complete household administration.**
  - Show member names/email appropriately instead of truncated UUIDs.
  - Add rename household, leave household, remove member, transfer ownership,
    and prevent deleting/removing the last owner without an explicit household
    deletion path.
  - Replace “no email is sent” invitations with a shareable invite link or
    actual email delivery before broadening beyond a tightly managed family.
  - **Done when:** common membership changes do not require database access.

- [ ] **Publish privacy, support, and data-retention pages.**
  - Link the privacy policy inside Settings as well as in App Store metadata.
  - Document Supabase, Pocket-ID, webhook providers, backups, attachment
    retention, account deletion, and how users request support/export.
  - Prepare accurate App Privacy answers for contact info, identifiers, user
    content, photos/files, purchase/maintenance costs, and diagnostics.
  - Generate and validate the final app privacy report/manifests, including
    manifests supplied by third-party SDKs.
  - **Done when:** policy, product behavior, SDK inventory, and App Store privacy
    disclosures agree.

- [ ] **Review authentication against App Review requirements.**
  - Document why Pocket-ID is the app's first-party/private household identity
    system and whether the login-services rule applies.
  - Provide App Review with a durable demo/review account and instructions that
    do not depend on access to the Bruner family's private household.
  - Keep demo data clearly fictional and ensure review can exercise all core
    features that do not require external webhook credentials.
  - **Done when:** a reviewer can enter, navigate, and test the app without
    contacting the team.

### Security and operations

- [ ] **Move notification bearer credentials out of household-readable rows.**
  - Current evidence: Discord webhook URLs and Telegram bot tokens are readable
    by every household member under the accepted v1.3 design.
  - Store secrets behind an owner-only/server-side boundary and return only
    masked configuration state to clients.
  - **Done when:** a member cannot retrieve another channel's reusable secret
    through the client or direct API.

- [ ] **Generate database types from the schema.**
  - Replace or verify the hand-maintained `database.types.ts` in CI so schema
    drift cannot compile successfully.
  - **Done when:** migrations and client types are mechanically checked together.

- [ ] **Add privacy-conscious diagnostics and release health.**
  - Capture crashes, rejected mutations, auth callback failures, attachment
    failures, and app/build version without recording serial numbers, notes,
    document URLs, webhook secrets, or other household content.
  - Add an in-app way to copy a support-safe diagnostic identifier.
  - Monitor Edge Function delivery, backup/restore checks, and minimum supported
    client/schema compatibility.
  - **Done when:** a TestFlight failure can be diagnosed without asking for
    private household data.

- [ ] **Exercise recovery, not just backup creation.**
  - Schedule periodic restore drills and document recovery-point and
    recovery-time expectations.
  - Verify attachment/database consistency after restore.
  - **Done when:** a named operator can recover a test environment using only
    the runbook and stored credentials.

### Native quality and release assets

- [ ] **Complete an accessibility pass.**
  - Associate visible field labels/errors with inputs and announce mutation
    success/failure.
  - Add accessible names and selected state to icon/emoji/category controls.
  - Do not make long-press the only discoverable delete path.
  - Verify Dynamic Type does not clip cards, tab labels, dates, or currency.
  - Verify contrast and never encode lifespan status by color alone.
  - **Done when:** the critical journeys work with VoiceOver and large text.

- [ ] **Polish native navigation and interaction.**
  - Use native-feeling screen titles/back behavior, safe-area insets, keyboard
    dismissal, input return keys, autofill/content types, haptics where useful,
    and consistent success feedback.
  - Confirm destructive actions, but avoid requiring precision gestures.
  - **Done when:** no critical screen feels like a desktop form placed inside
    an iPhone frame.

- [ ] **Create the App Store release package.**
  - Finalize app name/subtitle/description, category, age rating, support URL,
    privacy URL, keywords, screenshots, review notes, copyright, and icon/splash
    rendering.
  - Configure version/build-number ownership and a repeatable TestFlight and
    App Store submission path.
  - Confirm bundle identifier ownership, signing, capabilities, encryption
    declaration, minimum iOS version, and export-compliance answers.
  - **Done when:** the same production artifact passes internal TestFlight,
    external TestFlight, and submission validation.

## P2: Mobile-first product enhancements

- [ ] **Add per-user iOS notifications.**
  - Store one or more device tokens per user with last-seen/platform metadata
    and removal of invalid tokens.
  - Let each member opt into due maintenance, warranty, and lifespan reminders.
  - Deep-link notifications to the relevant item or completion screen.
  - Add snooze and mark-complete flows without changing the existing quiet
    weekly webhook digest for households that prefer it.
  - Keep notification content nonsensitive on the lock screen by default.

- [ ] **Finish “At the Appliance.”**
  - Add document attachments and maintenance-log attachments from the existing
    backlog.
  - Generate printable item QR labels using stable HTTPS universal links.
  - Scan a Hearth QR in-app and route safely to an item the user can access.
  - Add quick actions for “log maintenance,” “complete due task,” “take receipt
    photo,” and “copy model/serial.”

- [ ] **Add assisted capture.**
  - Scan barcodes/QR codes and offer on-device text extraction from model plates
    and receipts.
  - Always show extracted values for confirmation before saving.
  - Avoid uploading images to a new processor without a separate privacy and
    retention review.

- [ ] **Make offline writes a designed feature.**
  - Queue item/log/schedule mutations with visible pending/failed states.
  - Define per-field conflict behavior and attachment retry/cancellation.
  - Never claim a schedule is completed until the server accepts it.

- [ ] **Improve reminders and recurring maintenance.**
  - Add skip, snooze, pause, seasonal windows, and completion history.
  - Offer useful starter schedules based on item category without automatically
    enabling noisy reminders.
  - Separate “overdue” from “cannot calculate” and show the next action clearly.

- [ ] **Improve capture speed.**
  - Add duplicate item, recent/default location, remembered service provider,
    item templates, and “save and add another.”
  - Offer photo/document capture immediately after item or log creation.

- [ ] **Expand exports and household handoff.**
  - Produce a human-readable home inventory report with items, replacement
    outlook, warranties, maintenance history, and attachment index.
  - Add a package suitable for insurance, home sale, or transferring a home to
    a new owner, with an explicit redaction step for private documents.

## P3: Later differentiation

- [ ] **Replacement planning:** replacement-cost estimates, inflation-aware
  forecasts, annual reserve targets, and repair-versus-replace history.
- [ ] **Service-provider records:** contacts, quotes, invoices, recurring
  vendors, and one-tap call/email without exposing them to other households.
- [ ] **Custom taxonomy:** household-defined categories, rooms/areas, tags,
  archived/disposed items, and previous replacements.
- [ ] **Richer item history:** warranty claims, ownership documents, value
  changes, status transitions, and an auditable activity timeline.
- [ ] **Optional integrations:** calendar reminders, Shortcuts/App Intents, and
  share-extension capture, each justified by an observed family workflow.
- [ ] **Tablet support:** revisit `supportsTablet: false` only after the iPhone
  information architecture is stable.

## Recommended delivery sequence

1. **Native proof:** OAuth, session lifecycle, date picker, attachment capture,
   query error states, and a signed physical-device preview.
2. **Family TestFlight:** offline reads, form safety, deep links, native CI,
   diagnostics, and two weeks of daily use by multiple household members.
3. **Release candidate:** account/household lifecycle, privacy/security work,
   accessibility, restore drill, support content, and App Store assets.
4. **Mobile value:** iOS notifications, QR labels/scanning, document/log
   attachments, and assisted capture.

Do not make the App Store submission the first real-device test. TestFlight
usage should determine whether P2 starts with notifications, QR labels, or
capture speed.

## Audit notes

### Existing strengths

- Shared React Native/Expo Router code and mobile tab information architecture.
- iOS bundle identifier (`family.bruner.hearth`) and custom scheme (`hearth`).
- Strict TypeScript, schema validation, unit tests, RLS pgTAP tests, Edge
  Function checking, encrypted backup workflow, and restore verification.
- Household-scoped RLS and private attachment storage.
- Camera capture path, dark/light theme, touch-sized shared controls, demo mode,
  and several existing accessibility labels.

### Gaps observed on 2026-07-27

- Native bundle verification was blocked by a stale local dependency install:
  `fuse.js` is present in both `package.json` and `package-lock.json` but absent
  from the current `node_modules`. Typecheck, lint, unit tests, and iOS export
  all reached that same missing local package. This is not evidence of a lockfile
  defect; run `npm ci` before using those results as a release signal.
- There is no `eas.json`, native release workflow, physical-device smoke test,
  crash reporting, universal-link configuration, native push registration,
  in-app account deletion, privacy/support surface, or native date picker.
- Product query failures are not consistently rendered.
- Native OAuth initiation is incomplete as a callback/session flow.

## Current primary references

- [Expo authentication guide](https://docs.expo.dev/guides/authentication/)
- [Expo WebBrowser auth sessions](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Supabase native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase React Native Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Expo EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [Expo iOS submission](https://docs.expo.dev/submit/ios/)
- [Expo push notifications](https://docs.expo.dev/push-notifications/overview/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
