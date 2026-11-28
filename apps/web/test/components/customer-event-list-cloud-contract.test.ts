import {describe,expect,it} from 'vitest';
import fixtures from '../../../../contracts/customer-event-list/fixtures.json';
import {decodeDocument,decodeJson,encodeDocument,advance,initializeMigration,identity,planningReadiness,type PlanningDocument} from '../../../../functions/src/customer-event-lists/contract';
import {applyPlanningCommand,type PlanningTransaction} from '../../../../functions/src/customer-event-lists/trusted-writer';
import {fromWebItem,fromWebList,toWebItem} from '@/lib/customer/event-list/customer-event-list-cloud-contract';
const uid = 'customer_A';
const document = () => decodeDocument(structuredClone(fixtures.document),uid);
describe('shared cross-language corpus',()=>{
  it('round trips every field in all three kinds and both configurations',()=>{
    const d=document(); expect(decodeJson(encodeDocument(d),uid)).toEqual(fixtures.document);
    expect(d.entries.map(e=>e.kind)).toEqual(['catering_package','catering_package','marketplace_service','custom_menu']);
    expect(planningReadiness(d.entries[0])).toBe('configured_revalidation_required');
    expect(planningReadiness(d.entries[3])).toBe('unsupported_requires_review');
  });
  for(const fixture of fixtures.invalid) it('rejects '+fixture.name,()=>expect(()=>decodeDocument(fixture.document,fixture.ownerUid)).toThrow());
  it('Web package and menu adapters are lossless',()=>{
    for(const e of [document().entries[0],document().entries[3]]) {
      const projection=toWebItem(e); expect(projection.status).toBe('supported');
      if(projection.status==='supported') expect(fromWebItem(projection.item)).toEqual(e);
    }
  });
  it('keeps foreign Mobile configurations and marketplace entries read only',()=>{
    for(const e of document().entries.slice(1,3)) expect(toWebItem(e)).toMatchObject({status:'read_only',preserved:e});
  });
  it('accepts exactly 24, distinguishing providers and menu variants',()=>{
    const d=document(); d.entries=Array.from({length:24},(_,i)=>({...d.entries[0],providerId:'provider_'+i,identity:'catering_package:provider_'+i+':package_web'}));
    expect(decodeDocument(d,uid).entries).toHaveLength(24);
    d.entries[1]={...d.entries[0],selectionId:'other',identity:'catering_package:provider_0:other'};
    expect(decodeDocument(d,uid).entries).toHaveLength(24);
  });
  it('preserves the existing Web 30-service and million-guest menu bounds',()=>{
    const d=document();
    d.entries[0].configuration!.selectedEventServices=Array.from({length:30},(_,i)=>({id:'service_'+i,providerId:'provider_123',providerName:'Provider',name:'Service',category:null,price:1}));
    (d.entries[3].menu as {servingMaximumGuests:number}).servingMaximumGuests=1000000;
    expect(decodeDocument(d,uid)).toEqual(d);
  });
  it('never silently drops unknown native fields',()=>{
    const p=toWebItem(document().entries[0]); if(p.status!=='supported') throw Error();
    expect(()=>fromWebList(uid,[{...p.item,paymentToken:'forbidden'} as unknown as typeof p.item],null)).toThrow();
    const d=document(); d.entries[0].extra='forbidden'; expect(()=>decodeDocument(d,uid)).toThrow();
  });
});
describe('revision and migration invariants',()=>{
  it('rejects stale, skipped and cross-account writes',()=>{
    const current=document(), next=document(); next.revision=1;
    expect(advance(current,next,0).revision).toBe(1);
    expect(()=>advance(next,next,0)).toThrow(); next.revision=3; expect(()=>advance(current,next,0)).toThrow();
    next.ownerUid='customer_B'; expect(()=>advance(current,next,0)).toThrow();
  });
  it('two devices cannot both commit the same revision',()=>{
    const before=document(), a=document(), b=document(); a.revision=b.revision=1;
    a.entries.shift(); b.entries.pop(); const committed=advance(before,a,0);
    expect(()=>advance(committed,b,0)).toThrow();
  });
  it('clear and migration replay never resurrect deleted selections',()=>{
    const old=document(), cleared=document(); cleared.revision=1; cleared.entries=[];
    const cloud=advance(old,cleared,0);
    expect(initializeMigration(uid,cloud,old)).toEqual(cloud);
    expect(initializeMigration(uid,initializeMigration(uid,null,old),old)).toEqual(old);
    expect(()=>initializeMigration('customer_B',cloud,old)).toThrow();
  });
  it('canonical identity includes serving option',()=>{
    const e=document().entries[3]; expect(identity({...e,variantId:'another'})).not.toBe(e.identity);
  });
});
describe('inactive trusted writer enforcement',()=>{
  const setup=(cloud:unknown=null,user:unknown={role:'customer',accountStatus:'active',isActive:true,isBlocked:false})=>{
    const writes:PlanningDocument[]=[];
    const tx:PlanningTransaction={readUser:async()=>user,readList:async()=>cloud,createList:(_,d)=>{writes.push(d);},replaceList:(_,d)=>{writes.push(d);}};
    return {tx,writes};
  };
  it.each([null,'customer_B','feasta_guest_device_v1'])('rejects unauthorized uid %s',async auth=>{
    const {tx,writes}=setup(); await expect(applyPlanningCommand(auth,uid,{type:'initialize',local:document()},tx)).rejects.toThrow(); expect(writes).toEqual([]);
  });
  it.each([{role:'provider'},{role:'customer',accountStatus:'inactive',isActive:true,isBlocked:false},{role:'customer',accountStatus:'active',isActive:true,isBlocked:true},null])('rejects inactive or noncustomer user',async user=>{
    const {tx,writes}=setup(null,user); await expect(applyPlanningCommand(uid,uid,{type:'initialize',local:document()},tx)).rejects.toThrow(); expect(writes).toEqual([]);
  });
  it('initializes once; existing cloud requires review and stays authoritative',async()=>{
    const first=setup(); const result=await applyPlanningCommand(uid,uid,{type:'initialize',local:document()},first.tx); expect(first.writes).toHaveLength(1);
    const old=document(), empty=document(); empty.entries=[]; empty.revision=5;
    const second=setup(empty); const replay=await applyPlanningCommand(uid,uid,{type:'initialize',local:old},second.tx);
    expect(replay).toEqual({document:empty,migrationReviewRequired:true}); expect(second.writes).toEqual([]); expect(result.document.revision).toBe(0);
  });
  it('rejects invalid, oversized and stale writes before persisting',async()=>{
    for(const f of fixtures.invalid) {const {tx,writes}=setup(document()); await expect(applyPlanningCommand(uid,uid,{type:'replace',expectedRevision:0,document:f.document},tx)).rejects.toThrow(); expect(writes).toEqual([]);}
    const current=document(); current.revision=2; const {tx,writes}=setup(current); const next=document(); next.revision=1;
    await expect(applyPlanningCommand(uid,uid,{type:'replace',expectedRevision:0,document:next},tx)).rejects.toThrow(); expect(writes).toEqual([]);
  });
  it('allows only a validated next revision and no replace-before-initialize',async()=>{
    const next=document(); next.revision=1; const {tx,writes}=setup(document());
    await applyPlanningCommand(uid,uid,{type:'replace',expectedRevision:0,document:next},tx); expect(writes).toEqual([next]);
    await expect(applyPlanningCommand(uid,uid,{type:'replace',expectedRevision:0,document:next},setup().tx)).rejects.toThrow();
  });
});
