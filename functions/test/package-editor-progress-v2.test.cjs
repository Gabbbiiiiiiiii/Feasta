const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSaveEditorProgress, parseGetEditorProgress,
  validatePackageEditorProgress, assertNoUnverifiedEditorAssets, EditorProgressError,
} = require('../lib/packages/package-editor-progress-v2.js');

const limits = {maxSpecificOccasions: 10, maxThemeImages: 4};
const key = 'phase1c_private_editor_1234';
const base = (progress = {}, more = {}) => ({
  editorDraftId: null, expectedRevision: 0, packageId: null,
  expectedPackageRevision: null, editorSchemaVersion: 2, currentStep: 0,
  progress, idempotencyKey: key, ...more,
});
const fails = (fn, reason) => assert.throws(fn,
  (e) => e instanceof EditorProgressError && e.reason === reason);

test('new incomplete multi-occasion progress round-trips without deriving public authority', () => {
  const progress = {name:'', occasion:{occasionSchemaVersion:2, occasionScope:'specific',
    occasionIds:['birthday','wedding']}, priceText:'', pricingModel:'per_pax'};
  const result = parseSaveEditorProgress(base(progress), limits);
  assert.deepEqual(result.progress, progress);
  assert.equal(result.packageId, null);
  assert.equal(result.progress.occasion.occasionMatchIds, undefined);
  assert.equal(result.progress.occasion.eventType, undefined);
});

test('Fits All intent has empty writable IDs and no server-derived permissions', () => {
  const progress = {occasion:{occasionSchemaVersion:2,occasionScope:'all',occasionIds:[]}};
  assert.deepEqual(parseSaveEditorProgress(base(progress),limits).progress,progress);
  fails(() => parseSaveEditorProgress(base({occasion:{...progress.occasion,occasionIds:['birthday']}}),limits),
    'INVALID_EDITOR_PROGRESS');
});

test('intentionally partial progress, numeric text and steps are allowed', () => {
  assert.deepEqual(validatePackageEditorProgress({occasion:{occasionSchemaVersion:2}},limits),
    {occasion:{occasionSchemaVersion:2}});
  assert.equal(parseSaveEditorProgress(base({priceText:'-'}), limits).progress.priceText,'-');
  assert.equal(parseSaveEditorProgress(base({}, {currentStep:4}), limits).currentStep,4);
});

test('unknown keys, forged authorizations, URLs and malformed arrays fail closed', () => {
  const invalid = [
    {occasion:{occasionSchemaVersion:2,occasionIds:['birthday'],occasionMatchIds:['birthday']}},
    {occasion:{occasionSchemaVersion:2,occasionIds:['birthday','birthday']}},
    {occasion:{occasionSchemaVersion:2,occasionIds:['../../birthday']}},
    {eventType:'birthday'},
    {marketingAssetIds:['https://unsafe.invalid/image.png']},
    {themes:[{editorThemeId:'theme_1',name:'Test',description:'',assetIds:['../../a']}]},
    {tiers:{drop_off:{enabled:true,priceText:'2',includedServices:[],decorInclusions:[],
      furnitureInclusions:[],equipmentInclusions:[],extra:true}}},
    {name:'bad\u0000name'},
    {name:'a'.repeat(81)},
    {foodInclusions: new Array(2)},
    {paymentPolicy:'my_custom_payment_terms'},
    {pricingModel:'fixed_bundle'},
  ];
  for (const progress of invalid) {
    fails(() => validatePackageEditorProgress(progress,limits),'INVALID_EDITOR_PROGRESS');
  }
  fails(() => parseSaveEditorProgress({...base(),eventType:'birthday'},limits),
    'INVALID_EDITOR_PROGRESS');
  fails(() => parseSaveEditorProgress(base({}, {packageId:'some_package'}),limits),
    'CLIENT_UPGRADE_REQUIRED');
  fails(() => parseSaveEditorProgress(base({}, {editorSchemaVersion:3}),limits),
    'CLIENT_UPGRADE_REQUIRED');
});

test('bounded structural limits and mutually consistent revision fields', () => {
  fails(() => validatePackageEditorProgress({occasion:{occasionSchemaVersion:2,
    occasionScope:'specific',occasionIds:['birthday','wedding']}},
  {...limits,maxSpecificOccasions:1}), 'INVALID_EDITOR_PROGRESS');
  fails(() => validatePackageEditorProgress({themes:[{editorThemeId:'abc',name:'',
    description:'',assetIds:['a','b','c','d','e']}]}, limits),'INVALID_EDITOR_PROGRESS');
  fails(() => parseSaveEditorProgress(base({}, {expectedRevision:1}), limits),'INVALID_EDITOR_PROGRESS');
  fails(() => parseSaveEditorProgress(base({}, {editorDraftId:'draft_A'}),limits),
    'INVALID_EDITOR_PROGRESS');
  assert.equal(parseSaveEditorProgress(base({}, {editorDraftId:'draft_A',expectedRevision:3}),
    limits).expectedRevision,3);
  assert.equal(parseGetEditorProgress({editorDraftId:'draft_A'}),'draft_A');
  fails(() => parseGetEditorProgress({editorDraftId:'draft_A',providerId:'foreign'}),
    'INVALID_EDITOR_PROGRESS');
});

test('oversized nested progress is rejected independently of canonical completion', () => {
  const lines = Array.from({length:50},(_,i)=>`${i}`.padStart(160,'a'));
  const data = {foodInclusions:lines,serviceInclusions:lines,decorInclusions:lines,
    furnitureInclusions:lines,equipmentInclusions:lines};
  assert.ok(JSON.stringify(data).length < 128*1024);
  assert.deepEqual(validatePackageEditorProgress(data,limits),data);
  // Many valid theme/marketing/tier strings do not by themselves permit a 128KB payload.
  const giant = new Array(12).fill(null).map((_,i)=>({
    editorThemeId:`theme_${i}`,name:'x'.repeat(80),description:'z'.repeat(500),assetIds:[],
  }));
  assert.ok(validatePackageEditorProgress({themes:giant},limits));
});

test('unverified uploaded media cannot be attached as draft references', () => {
  assert.doesNotThrow(() => assertNoUnverifiedEditorAssets({themes: [{
    editorThemeId:'theme_1',name:'Example',description:'',assetIds:[],
  }], marketingAssetIds:[]}));
  fails(() => assertNoUnverifiedEditorAssets({marketingAssetIds:['asset_a']}),
    'CLIENT_UPGRADE_REQUIRED');
  fails(() => assertNoUnverifiedEditorAssets({themes:[{
    editorThemeId:'theme_1',name:'Example',description:'',assetIds:['asset_a'],
  }]}), 'CLIENT_UPGRADE_REQUIRED');
});
