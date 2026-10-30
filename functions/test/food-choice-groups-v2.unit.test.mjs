import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFoodChoiceGroupsV2 as parse} from '../src/packages/food-choice-groups-v2.ts';
const group=()=>[{id:'main',title:'Main dish',selectionCount:1,options:[{id:'a',name:'Chicken Afritada'},{id:'b',name:'Pork Menudo'},{id:'c',name:'Fish'}]}];
const invalid=x=>assert.throws(()=>parse(x),/INVALID_FOOD_CHOICE_GROUP/);
test('valid required one of three',()=>assert.deepEqual(parse(group()),group()));
test('supports explicit two of three rule',()=>{const g=group();g[0].selectionCount=2;assert.deepEqual(parse(g),g);});
test('no choice groups is backwards compatible',()=>assert.deepEqual(parse([]),[]));
test('rejects missing group title',()=>{const g=group();g[0].title='';invalid(g);});
test('rejects missing options',()=>{const g=group();g[0].options=[];invalid(g);});
test('rejects impossible selection count',()=>{const g=group();g[0].selectionCount=4;invalid(g);});
test('rejects duplicate options ignoring case and whitespace',()=>{const g=group();g[0].options[1].name='  chicken   afritada  ';invalid(g);});
test('rejects duplicate option IDs',()=>{const g=group();g[0].options[1].id='a';invalid(g);});
test('rejects duplicate group titles',()=>{const g=group();g.push({...group()[0],id:'other',title:' main  dish '});invalid(g);});
test('rejects unknown fields and corrupt objects',()=>{const g=group();g[0].untrusted=true;invalid(g);invalid(null);invalid({});});
test('rejects control characters',()=>{const g=group();g[0].options[0].name='Bad\nName';invalid(g);});
test('permits unfinished options for editor progress only',()=>{const g=group();g[0].options[1].name='';assert.equal(parse(g,true)[0].options[1].name,'');invalid(g);});
test('rejects too many groups',()=>{const g=Array.from({length:11},(_,i)=>({...group()[0],id:'group'+i,title:'Group '+i}));invalid(g);});
test('rejects oversized payload',()=>{const g=group();g[0].options[0].name='a'.repeat(121);invalid(g);});

test('rejects accessors and hidden or symbol properties without invoking getters',()=>{
 const g=group();let invoked=false;
 Object.defineProperty(g[0],'title',{enumerable:true,get(){invoked=true;return 'Main';}});
 invalid(g);assert.equal(invoked,false);
 const hidden=group();Object.defineProperty(hidden[0],'extra',{value:true});invalid(hidden);
 const symbol=group();symbol[0][Symbol('extra')]=true;invalid(symbol);
});
test('multiple groups can require different counts',()=>{
 const g=group();g.push({...group()[0],id:'sides',title:'Sides',selectionCount:2});
 assert.deepEqual(parse(g),g);
});
test('rejects fractional, nonfinite, zero and string counts',()=>{
 for(const count of [0,-1,1.5,NaN,Infinity,'1',null]) {const g=group();g[0].selectionCount=count;invalid(g);}
});
