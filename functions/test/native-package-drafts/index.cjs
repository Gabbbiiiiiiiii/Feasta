// Test-only Functions emulator entry. Never deploy this directory.
const path = require('node:path');
const real = require('node:module').createRequire(path.resolve(__dirname, '../../package.json'));
// Discovery only registers metadata; request admission stays in the real handlers.
real('firebase-admin/app').initializeApp();
const fs = require('node:fs');
const logPath = path.join(require('node:os').tmpdir(), 'feasta-native-v2-media-calls.log');
real('cloudinary').v2.api.resource = async publicId => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true' || !/^demo-/.test(process.env.GCLOUD_PROJECT || '')) throw new Error('DEMO_ONLY');
  fs.appendFileSync(logPath, 'mock-resource-call\n');
  if (!publicId.endsWith('/native_owned/image')) throw new Error('Mock resource absent');
  return {resource_type:'image', bytes:1024, format:'jpg',
    secure_url:'https://res.cloudinary.com/test/image/upload/' + publicId + '.jpg'};
};
Object.assign(exports, require('../../lib/packages/provider-package-drafts-v2.js'),
  require('../../lib/packages/provider-package-editor-progress.js'),
  require('../../lib/packages/publish-provider-package.js'),
  require('../../lib/packages/customer-package-v2.js'),
  require('../../lib/bookings/submit-booking-request.js'),
  require('../../lib/bookings/get-booking-refund-policy-disclosures.js'),
  require('../../lib/provider-availability/check-customer-provider-availability.js'),
  require('../../lib/provider-availability/get-customer-provider-calendar-availability.js'));
delete exports.publishProviderPackageV2Internal;
// Export only callable handlers (helpers are not Firebase functions).
for (const [key, value] of Object.entries(exports)) if (!value?.__endpoint) delete exports[key];
exports.inspectNativeMediaCalls = real('firebase-functions/v2/https').onCall(
  {region:'asia-southeast1',enforceAppCheck:false}, () => ({calls: fs.existsSync(logPath) ? fs.readFileSync(logPath,'utf8').trim().split('\n').length : 0}));
