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
const accountStateRepository = read(
  "apps/customer_mobile/lib/features/authentication/data/repositories/" +
  "customer_auth_state_repository.dart",
);
const accountGate = read(
  "apps/customer_mobile/lib/features/authentication/domain/" +
  "auth_account_state.dart",
);
const authenticationController = read(
  "apps/customer_mobile/lib/features/authentication/application/" +
  "customer_auth_controller.dart",
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
assert.match(accountStateRepository, /isBlocked: userData\['isBlocked'\]/u);
assert.match(
  accountGate,
  /profile\.isBlocked == true \|\| accountStatus == AccountStatus\.blocked/u,
);
assert.match(
  authenticationController,
  /AuthenticationGateKind\.blocked[\s\S]+_terminateSessionPreservingState/u,
);
assert.match(authenticationController, /repository\.signOut\(\)/u);
assert.match(releaseManifest, /usesCleartextTraffic="false"/u);
assert.match(debugManifest, /usesCleartextTraffic="true"/u);

console.log("Flutter security source validation passed.");
