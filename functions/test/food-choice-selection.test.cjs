const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseFoodChoiceSelections:parse,resolveFoodChoiceSelections:resolve}=require('../lib/bookings/food-choice-selection.js');
const data=()=>({foodChoiceGroups:[{id:'main',title:'Main dish',selectionCount:1,options:[{id:'a',name:'Chicken'},{id:'b',name:'Pork'}]}]});
test('legacy packages need no choices',()=>assert.deepEqual(resolve({},parse(undefined)),[]));
test('snapshots authoritative names',()=>assert.deepEqual(resolve(data(),parse([{groupId:'main',optionIds:['a']}])),[{groupId:'main',title:'Main dish',selectionCount:1,options:[{id:'a',name:'Chicken'}]}]));
test('rejects missing, excess and unknown selections',()=>{
 for(const input of [[],[{groupId:'main',optionIds:[]}],[{groupId:'main',optionIds:['a','b']}],[{groupId:'other',optionIds:['a']}],[{groupId:'main',optionIds:['unknown']}]]) assert.throws(()=>resolve(data(),parse(input)));
});
test('rejects forged rules and duplicate IDs',()=>{
 for(const input of [null,{},[{groupId:'main',optionIds:['a'],selectionCount:0}],[{groupId:'main',optionIds:['a','a']}],[{groupId:'main',optionIds:['a']},{groupId:'main',optionIds:['b']}]]) assert.throws(()=>parse(input));
});
test('package rule changes invalidate old selections',()=>{const changed=data();changed.foodChoiceGroups[0].selectionCount=2;assert.throws(()=>resolve(changed,parse([{groupId:'main',optionIds:['a']}])));});
test('different required counts across multiple groups',()=>{
 const d=data();d.foodChoiceGroups.push({...data().foodChoiceGroups[0],id:'side',title:'Sides',selectionCount:2});
 assert.equal(resolve(d,parse([{groupId:'main',optionIds:['b']},{groupId:'side',optionIds:['a','b']}])).length,2);
});
test('legacy packages reject unsolicited choices',()=>assert.throws(()=>resolve({},parse([{groupId:'main',optionIds:['a']}]))));
test('malformed authoritative rules fail closed',()=>assert.throws(()=>resolve({foodChoiceGroups:[{id:'bad'}]},[]),e=>e.code==='failed-precondition'));
