if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:44080" ||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:44999" ||
   process.env.GCLOUD_PROJECT!=="demo-feasta-consent")throw Error("Dedicated local demo emulators required");
require("firebase-admin/app").initializeApp({projectId:"demo-feasta-consent"});
const {db}=require("../../lib/shared/firestore.js"),auth=require("firebase-admin/auth").getAuth();
const clear=async()=>{for(const name of ["users","customers","agreementTypes","agreementTemplates","rateLimits"]){
  const docs=await db.collection(name).get();const batch=db.batch();docs.docs.forEach(d=>batch.delete(d.ref));if(docs.size)await batch.commit();
}const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(u=>u.uid));};
// Inject a retryable abort after the first profile transaction has read policy
// and queued writes. On the SDK's next attempt publish a newer policy before
// re-reading it. The actual emulator transaction must discard its first writes.
const original=db.runTransaction.bind(db);
let pendingRace;
db.runTransaction=(fn,...options)=>original(async tx=>{
  let profileWrite=false;
  for(const method of ["create","update"]){
    const originalWrite=tx[method].bind(tx);
    tx[method]=(ref,...args)=>{
      if(ref.path.startsWith("users/"))profileWrite=true;
      return originalWrite(ref,...args);
    };
  }
  if(pendingRace?.retry){const action=pendingRace.action;pendingRace=null;await action();}
  const result=await fn(tx);
  if(pendingRace && profileWrite){
    pendingRace.retry=true;const error=new Error("Injected retryable contention");error.code=10;throw error;
  }
  return result;
},...options);
require("../helpers/customer-consent-suite.cjs")({db,auth,clear,concurrent:true,
  race:action=>{pendingRace={action,retry:false};}});
