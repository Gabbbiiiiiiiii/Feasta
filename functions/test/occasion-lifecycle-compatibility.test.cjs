/** Static compatibility boundaries in addition to transaction tests.
 * These are NOT Firebase emulator/live integration tests.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const root = resolve(__dirname, '../../');
const source = (p) => readFileSync(resolve(root,p),'utf8');

test('old installed Flutter clients cannot publicly read withdrawn packages',()=>{
  const rules=source('firebase/firestore.rules');
  const match=rules.slice(rules.indexOf('match /packages/{packageId}'),
    rules.indexOf('match /menuItems/{menuItemId}'));
  for(const condition of ["resource.data.status == 'published'",
    'resource.data.isActive == true','resource.data.isPublished == true',
    'resource.data.providerPubliclyVisible == true',
    'allow create, update, delete: if false;']){
    assert.ok(match.includes(condition),condition);
  }
  const helper=source('apps/customer_mobile/lib/core/helpers/legacy_occasion_visibility.dart');
  assert.match(helper,/bool isLegacyOccasionPublicPackage\(/u);
  assert.match(helper,/occasionSchemaVersion/u);
  assert.match(helper,/pricingModel/u);
});
test('customer Web rejects V2 public records while publication is gated',()=>{
  const text=source('apps/web/src/lib/customer/discovery/public-package-normalization.ts');
  assert.match(text,/!isLegacyOccasionReadable\(value\)/u);
  assert.match(text,/Object\.prototype\.hasOwnProperty\.call\(value, "pricingModel"\)/u);
  assert.match(text,/value\.isPublished !== true/u);
  assert.match(text,/value\.providerPubliclyVisible !== true/u);
});
test('server blocks inactive occasion and V2 package bookings in existing transactions',()=>{
  const submit=source('functions/src/bookings/submit-booking-request.ts');
  assert.match(submit,/stableOccasionPublicationGeneration\(occasionCatalogSnapshot.data\(\)\)/u);
  assert.match(submit,/activeOccasionAuthority\(occasionSnapshot.data\(\), eventType\)/u);
  assert.match(submit,/isLegacyOccasionPackage/u);
  const publication=source('functions/src/packages/publish-provider-package.ts');
  assert.match(publication,/activeOccasionAuthority\(occasionSnapshot.data\(\), validated.eventType/u);
  assert.match(publication,/stableOccasionPublicationGeneration/u);
});
test('published setup gallery has a catalog generation gate and compatibility filter',()=>{
  const service=source('apps/web/src/lib/provider/provider-setup-gallery-service.ts');
  assert.match(service,/transaction.get\(/u);
  assert.match(service,/collection\("occasionCatalog"\)\.doc\("current"\)/u);
  assert.match(service,/occasion.active !== true/u);
  assert.match(service,/publicLegacyProviderSetupsFromMixed/u);
  const domain=source('apps/web/src/lib/provider/provider-setup-gallery-public-compat.ts');
  assert.match(domain,/publicProviderSetups\(legacy, ownerId\)/u);
  assert.match(source("apps/web/src/lib/provider/provider-setup-gallery.ts"),/setup\.isPublished && setup\.imageUrls\.length > 0/u);
});
test('lifecycle does not touch bookings, payments, or refund records',()=>{
  const implementation=source('functions/src/admin/occasion-lifecycle-atomic.ts');
  for(const collection of ['"bookings"','"payments"','"refunds"']){
    assert.equal(implementation.includes('.collection('+collection+')'),false);
  }
  assert.match(implementation,/restorationPerformed: false/u);
});
