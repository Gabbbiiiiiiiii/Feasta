import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const bootstrap = read("apps/customer_mobile/lib/app/bootstrap.dart");
const runtime = read(
  "apps/customer_mobile/lib/core/security/runtime_security.dart",
);
const main = read("apps/customer_mobile/lib/main.dart");
const addresses = read(
  "apps/customer_mobile/lib/features/authentication/data/services/" +
  "customer_address_storage_service.dart",
);
const booking = read(
  "apps/customer_mobile/lib/features/authentication/data/repositories/" +
  "feasta_repository.dart",
);
const sessionMonitor = read(
  "apps/customer_mobile/lib/features/customer/customer_main_screen.dart",
);
const releaseManifest = read(
  "apps/customer_mobile/android/app/src/main/AndroidManifest.xml",
);
const debugManifest = read(
  "apps/customer_mobile/android/app/src/debug/AndroidManifest.xml",
);

assert.match(bootstrap, /validateEmulatorMode/u);
assert.match(bootstrap, /isDebugMode: kDebugMode/u);
assert.match(bootstrap, /validateFirebaseProject/u);
assert.match(bootstrap, /AndroidPlayIntegrityProvider/u);
assert.match(runtime, /useEmulators && !isDebugMode/u);
assert.match(runtime, /uri\.scheme != 'https'/u);
assert.match(main, /_StartupFailureApp/u);
assert.match(addresses, /FlutterSecureStorage/u);
assert.doesNotMatch(addresses, /setStringList\(\s*_savedAddressesKey/u);
assert.match(booking, /_requireVerifiedActiveCustomer/u);
assert.match(booking, /isPhoneVerified/u);
assert.match(sessionMonitor, /data\['isBlocked'\] == true/u);
assert.match(sessionMonitor, /FirebaseAuth\.instance\.signOut/u);
assert.match(releaseManifest, /usesCleartextTraffic="false"/u);
assert.match(debugManifest, /usesCleartextTraffic="true"/u);

console.log("Flutter security source validation passed.");
