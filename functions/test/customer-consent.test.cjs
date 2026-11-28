const {resolve} = require("node:path");
const records=new Map(), users=new Map();
const copy=v=>v===undefined?undefined:structuredClone(v);
const snap=path=>({id:path.split("/").at(-1),exists:records.has(path),data:()=>copy(records.get(path))});
function collection(name){return {name,doc(id){const path=name+"/"+id;return {path,
  get:async()=>snap(path),set:async v=>records.set(path,copy(v)),update:async v=>records.set(path,{...records.get(path),...copy(v)}),
  delete:async()=>records.delete(path)};}};}
let hook;
const db={collection,runTransaction:async fn=>{
  for(let attempt=0;attempt<2;attempt++){
    const writes=[];let writing=false;
    const tx={getAll:async(...refs)=>refs.map(r=>snap(r.path)),
      get:async ref=>{if(writing)throw Error("read after write");return ref.path?snap(ref.path):
        {docs:[...records.keys()].filter(k=>k.startsWith(ref.name+"/")).map(snap)};},
      create:(r,v)=>{writing=true;if(records.has(r.path))throw Error("duplicate");writes.push([r.path,v]);},
      update:(r,v)=>{writing=true;writes.push([r.path,{...records.get(r.path),...v}]);},
      set:(r,v)=>{writing=true;writes.push([r.path,v]);}};
    const result=await fn(tx);
    if(hook && writes.some(([p])=>p.startsWith("users/"))){const action=hook;hook=null;await action();continue;}
    writes.forEach(([p,v])=>records.set(p,copy(v)));return result;
  }
}};
const auth={createUser:async u=>users.set(u.uid,{...u,disabled:false,providerData:[],emailVerified:false}),
  updateUser:async(id,patch)=>users.set(id,{...users.get(id),...patch}),getUser:async id=>copy(users.get(id))};
function replace(path,exports){require.cache[path]={id:path,filename:path,loaded:true,exports};}
replace(resolve(__dirname,"../lib/shared/firestore.js"),{db});
replace(require.resolve("firebase-admin/auth"),{getAuth:()=>auth});
let timestamp=0;
replace(resolve(__dirname,"../lib/shared/timestamps.js"),{serverTimestamp:()=>++timestamp});
require("./helpers/customer-consent-suite.cjs")({db,auth,clear:async()=>{records.clear();users.clear();},
  race:action=>{hook=action;}});
