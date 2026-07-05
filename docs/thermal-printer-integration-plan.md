# Direct Bluetooth Thermal Printing Plan (replace RawBT dependency)

Status: Phase 0 spike in progress on branch `claude-mobile/thermal-printer-spike`. Target device confirmed: GOOJPRT PT-210 (Bluetooth 4.0 classic SPP, ESC/POS command set, 384 dots/line print head, 48mm printable width on ~58mm paper stock, DC 5V/2A, 90mm/s).

## Decisions locked in (2026-07-05)

1. Library: **`@finan-me/react-native-thermal-printer`** (v1.0.9) is the first and only candidate for Phase 0 - actively published, documents Android 12+ permissions clearly, supports Bluetooth Classic/BLE/LAN, and ships a declarative document API (text/table/qr/image/cut) instead of requiring us to hand-roll raw ESC/POS bytes. `mybigday/react-native-thermal-printer` and the original inactive snippet are documented as fallbacks only if this one fails on the real PT-210.
2. Hidden debug logs (Phase 1+): reuse the existing developer-role gate already used elsewhere in this app (`user?.role === 'developer'`), not a brand-new surface.
3. Confirmed real API surface for the chosen library (verified by installing it and reading its actual TypeScript source, not just the README):
   - `ThermalPrinter.scanDevices()` -> `{ paired: BluetoothDevice[], found: BluetoothDevice[] }`, each device `{ name, address, deviceType }`.
   - `ThermalPrinter.testConnection(address)` -> `{ success, deviceName?, deviceType?, error? }` (address only, no options param).
   - `ThermalPrinter.printReceipt(job)` where `job.printers[].address` uses the `bt:MAC` / `ble:MAC` / `lan:IP:PORT` scheme.
   - `ThermalPrinter.addConnectionEventListener(ThermalPrinter.EVENT_CONNECTION_STATE_CHANGED, cb)` / `removeConnectionEventListener(sub)` for live `connecting|connected|disconnected` status.
   - Printer options: `{ paperWidthMm: 32 | 58 | 80, encoding, marginMm }` - only discrete presets, no arbitrary mm value, hence `58` (not `48`) for the PT-210.
   - The library's own Android `AndroidManifest.xml` already declares `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` (merged automatically) - no custom Expo config plugin was needed, just the explicit entries in `app.config.js` for clarity and the standard `PermissionsAndroid` runtime request in JS.

## What exists today

- `src/utils/invoicePrint.js` builds an HTML receipt (72mm-styled `thermalTemplate`) via `expo-print` + `expo-sharing`, handed to Android's share sheet where the user picks RawBT.
- `InvoiceDetailScreen.js` / `InvoicesScreen.js` call `printInvoiceDocument()` / `printInvoiceListDocument()` with a simple `printing` spinner state - no real connection state today since RawBT owns that.
- Expo SDK ~56, React Native 0.85.3 (New Architecture default). Native Android builds happen locally (`npm run android` -> `expo run:android`); the project already has one custom Expo config plugin (`plugins/withApkInstallerSupport.js`) proving the "install native module -> prebuild -> run" pattern is known-good here. Only `android/app/build.gradle` is committed; the rest of `android/` regenerates via `expo prebuild`.

## Target behavior

- Remove the hard RawBT dependency for the primary print action - talk to the PT-210 directly over Bluetooth Classic.
- Single static printer profile: hardcode PT-210 characteristics (58mm paper-width preset / ESC/POS), only let the user pick which **paired** device is "the printer" (MAC address stored once).
- UI mirrors RawBT's simple mental model: connection status pill (Not connected / Connecting / Connected / Error) plus a print action that reconnects silently when needed.
- Verbose driver logs hidden from normal users, gated behind the existing developer role.
- Keep "Share as PDF" as a fallback action during the transition.

## Phased plan

### Phase 0 - Spike (IN PROGRESS on `claude-mobile/thermal-printer-spike`)
1. Pair the PT-210 with the Infinix phone from Android's own Bluetooth settings first (hard OS requirement for classic SPP, not a library limitation).
2. `@finan-me/react-native-thermal-printer` added to `package.json`; `BLUETOOTH_CONNECT`/`BLUETOOTH_SCAN` added to `app.config.js` permissions for clarity (library manifest already covers the full set via merge).
3. Throwaway screen `src/screens/dev/ThermalPrinterSpikeScreen.js` + `src/services/thermalPrinterSpike.js` added, reachable only for `role === 'developer'` via a temporary button on `ProfileScreen`. Lists paired devices, requests runtime permissions, tests connection, prints a minimal ESC/POS test slip (text + table + cut), shows a raw on-screen log.
4. **Manual verification needed from you** (see "Next steps to run on your PC" below): does it actually pair/connect/print on the real PT-210?
5. Only after a successful real-hardware print do we move to Phase 1.

### Phase 1 - Printer connection service (foundation)
- `src/services/thermalPrinter.js` (production version, replacing the spike file): bonded-device discovery, single stored MAC (SecureStore, same pattern as `api.js` token storage), connect/disconnect, status state machine, reconnect-on-demand before every print job, single internal logger gated behind the developer flag.

### Phase 2 - Printer settings screen
- Minimal "select paired printer" + connect/test-print + status pill screen replacing "configure it in RawBT".

### Phase 3 - Real receipt formatting (58mm-preset / 48mm-printable ESC/POS layout)
- Rebuild the receipt as `ThermalPrinter.printReceipt` document content (text/table/line/cut), reusing the exact invoice/customer/line data `buildThermalInvoiceBody`/`buildInvoiceListBody` already assemble - company-scoped API data stays the only source, no hardcoded identity.
- Logo (optional): ESC/POS image printing needs a real bitmap sourced from company document/branding settings, not a bundled static asset.

### Phase 4 - Wire into existing screens
- Swap `printInvoiceDocument()` / `printInvoiceListDocument()` (or add new functions and switch call sites) to the new service, keeping the existing `printing` spinner UX. Keep "Share as PDF" as a secondary action.

### Phase 5 - Hardening
- Printer off/out of range, Bluetooth disabled, permission denied/revoked, never-configured printer, long product names/many lines, low battery if reported. Confirm hidden-logs gate works and normal users never see raw output.

## Next steps to run on your PC (Phase 0 manual test)

This code was written and reviewed in the agent's sandbox and pushed to GitHub on branch `claude-mobile/thermal-printer-spike` (based on the `v1.3.31` release tag) - it has **not** been built or run on real hardware yet, since that requires your actual phone and printer. On your PC:

1. `git fetch origin` then `git checkout claude-mobile/thermal-printer-spike` in your working `ventify-stock` checkout (pull this branch into whichever checkout you actually build from - not necessarily the OneDrive-mounted copy).
2. `npm install` (pulls in `@finan-me/react-native-thermal-printer`).
3. Pair the GOOJPRT PT-210 with your Infinix phone from Android's Bluetooth settings (must be paired/bonded before the app can see it).
4. `npx expo prebuild --clean` (regenerates the native Android project so the new library's manifest/native code is merged in).
5. `npm run android` (builds and installs on your connected/ADB'd phone).
6. Log into the app as a `developer`-role user, open Profile, tap "Open printer spike".
7. Tap "Request permissions" -> grant Bluetooth permission when Android prompts.
8. Tap "List paired devices" -> confirm the PT-210 shows up.
9. Tap the PT-210 row -> watch the status pill go `connecting` -> `connected` (or see the raw error in the log at the bottom if it fails).
10. Tap "Print ESC/POS test slip" -> confirm a real slip prints with the sample text/table/total and a paper cut.
11. Report back exactly what happened at each step (especially any error code/message from the on-screen log) so Phase 1 can start from a confirmed-working baseline, or so we can pivot to the fallback library if this one has a real problem with your specific printer.
