const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const contract=require('@feasta/shared-types/freelance-service-details');
// Execute the actual snapshot expression from the handler, with trusted reads.
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/bookings/submit-booking-request.ts'),'utf8');
const ast=ts.createSourceFile('submission.ts',source,ts.ScriptTarget.Latest,true);
let expression;
function visit(node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='selectedAddOns'&&node.initializer.getText(ast).startsWith('selectedAddOns.map('))expression=node.initializer.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert.ok(expression,'authoritative snapshot expression must exist');
const script=ts.transpileModule('result = '+expression,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const details={deliverables:[{id:'photos',name:'Edited photos',min:2,max:4,unit:'weeks',method:'gallery'}],collaboration:'direct',collaborationNotes:'Meet the photographer',addOns:[],travelZones:[],coverageMinutes:120,crewSize:2,clientRequirements:'Arrive early'};
function snapshot({category='photographer',registration='company',source='feasta_addon_provider',terms=details}={}){const addon={id:'service',providerId:'studio',source,category,price:4500};const context={...contract,selectedAddOns:[addon],cateringProvider:{businessRegistrationType:registration},marketplaceProviders:new Map([['studio',{data:{businessRegistrationType:registration}}]]),addonSnapshots:[{get:field=>{assert.equal(field,'freelanceDetails');return terms;}}]};vm.runInNewContext(script,context);return JSON.parse(JSON.stringify(context.result[0]));}
for(const category of ['photographer','videographer'])test(category+' freezes server fulfillment and keeps authoritative price and provider',()=>{const result=snapshot({category});assert.equal(result.providerId,'studio');assert.equal(result.price,4500);assert.equal(result.freelanceFulfillment.coverageMinutes,120);assert.equal(result.freelanceFulfillment.deliverables[0].name,'Edited photos');assert.equal(result.freelanceFulfillment.addOns,undefined);});
test('catering-owned individual service uses its authoritative provider',()=>assert.equal(snapshot({category:'other',registration:'individual',source:'catering_provider'}).freelanceFulfillment.crewSize,2));
test('unsupported company service does not acquire freelance terms',()=>assert.equal(snapshot({category:'other'}).freelanceFulfillment,undefined));
test('malformed stored terms cannot inject a fulfillment snapshot',()=>assert.equal(snapshot({terms:{...details,coverageMinutes:-1}}).freelanceFulfillment,undefined));
