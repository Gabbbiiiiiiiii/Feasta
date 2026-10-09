const {before,after,test}=require("node:test");
const {assertFails}=require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,getDoc}=require("firebase/firestore");
const {createRulesTestEnvironment,authenticated,seedDocuments,userData}=require("./rules-test-helpers.cjs");
let env;
before(async()=>{env=await createRulesTestEnvironment();await seedDocuments(env,{
 "users/provider":userData("provider","provider"),"users/customer":userData("customer","customer"),"users/admin":userData("admin","admin"),
 "providerDisbursements/payout":{providerId:"provider-provider",status:"ready",amountInCentavos:900000},
 "providerDisbursementAttempts/attempt":{status:"processing",amountInCentavos:900000},
 "providerPayoutAttempts/member":{status:"processing",amountInCentavos:450000}});});
after(async()=>env?.cleanup());
for(const role of ["provider","customer","admin"])for(const collection of ["providerDisbursements","providerDisbursementAttempts","providerPayoutAttempts"]) {
 test(`${role} cannot create canonical ${collection}`,async()=>{
 const db=authenticated(env,role,role).firestore();await assertFails(setDoc(doc(db,`${collection}/forged`),{
  status:"paid",amountInCentavos:1,paidAt:new Date(),destinationSnapshot:{number:"forged"},attemptSequence:99,gatewayResourceId:"forged"}));});
 test(`${role} cannot mark ${collection} paid or edit frozen finance fields`,async()=>{
 const db=authenticated(env,role,role).firestore();const id=collection==="providerDisbursements"?"payout":collection==="providerDisbursementAttempts"?"attempt":"member";
 await assertFails(updateDoc(doc(db,`${collection}/${id}`),{status:"paid",amountInCentavos:1,reservedAmountInCentavos:0,
  destinationSnapshot:{number:"forged"},gatewayResourceId:"forged",attemptSequence:99,reconciliationRequired:false,paidAt:new Date()}));});
}
