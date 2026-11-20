const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const root = resolve(__dirname,'../..');
test('generated TypeScript and Dart embed the identical closed schema',()=>{
  const schema=JSON.parse(readFileSync(resolve(root,'contracts/customer-event-list/schema.json'),'utf8'));
  const ts=readFileSync(resolve(root,'functions/src/customer-event-lists/schema.ts'),'utf8');
  const dart=readFileSync(resolve(root,'apps/customer_mobile/lib/shared/models/customer_event_list_cloud_schema.dart'),'utf8');
  assert.deepEqual(JSON.parse(ts.slice(ts.indexOf('= ')+2,ts.lastIndexOf(' as const;'))),schema);
  assert.deepEqual(JSON.parse(dart.split("r'''")[1].split("''';")[0]),schema);
});
