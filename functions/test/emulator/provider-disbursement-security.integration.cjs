const {before,after,test}=require("node:test"),assert=require("node:assert/strict");
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:43080")throw new Error("Isolated local emulator required.");
const {initializeApp,getApps}=require("firebase-admin/app");if(!getApps().length)initializeApp({projectId:"demo-feasta-phase3"});
const {db}=require("../../lib/shared/firestore.js");
const base="http://127.0.0.1:43080/v1/projects/demo-feasta-phase3/databases/(default)/documents";
function token(uid){const now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
 return `${encode({alg:"none",typ:"JWT"})}.${encode({iss:"https://securetoken.google.com/demo-feasta-phase3",aud:"demo-feasta-phase3",
  sub:uid,user_id:uid,iat:now,exp:now+3600,auth_time:now,role:uid,email:`${uid}@example.test`,email_verified:true,
  firebase:{sign_in_provider:"custom",identities:{}}})}.`;}
const paths=[];
before(async()=>{for(const role of ["provider","customer","admin"]){const path=`users/${role}`;paths.push(path);
 await db.doc(path).set({uid:role,role,accountStatus:"active",isActive:true,isBlocked:false,providerId:role==="provider"?"provider-provider":null});}
 for(const collection of ["providerDisbursements","providerDisbursementAttempts","providerPayoutAttempts"]){const path=`${collection}/security-fixture`;paths.push(path);
 await db.doc(path).set({providerId:"provider-provider",status:"ready",amountInCentavos:900000});}});
after(async()=>{for(const path of paths)await db.doc(path).delete();});
for(const role of ["provider","customer","admin"]){
 test(`${role} emulator token resolves authenticated access to own profile`,async()=>{
  const response=await fetch(`${base}/users/${role}`,{headers:{Authorization:`Bearer ${token(role)}`}});
  assert.equal(response.status,200,await response.text());
 });
 for(const collection of ["providerDisbursements","providerDisbursementAttempts","providerPayoutAttempts"]){
  for(const operation of ["create","update"])test(`${role} cannot ${operation} canonical ${collection} fields`,async()=>{
   const id=operation==="create"?`forged-${role}`:"security-fixture";
   const response=await fetch(`${base}/${collection}/${id}`,{method:"PATCH",headers:{Authorization:`Bearer ${token(role)}`,"Content-Type":"application/json"},
    body:JSON.stringify({fields:{status:{stringValue:"paid"},amountInCentavos:{integerValue:"1"},attemptSequence:{integerValue:"99"},
     reservedAmountInCentavos:{integerValue:"0"},gatewayResourceId:{stringValue:"forged"},
     destinationSnapshot:{mapValue:{fields:{number:{stringValue:"forged"}}}},paidAt:{timestampValue:new Date().toISOString()}}})});
   const body=await response.json();assert.equal(response.status,403,JSON.stringify(body));assert.equal(body.error?.status,"PERMISSION_DENIED");
  });
 }
}
