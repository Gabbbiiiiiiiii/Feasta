// Prepare only generated local demo fixtures. No dependency installation.
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname,'../../..');
for (const name of ['firestore.rules','firestore.indexes.json','storage.rules']) {
 fs.copyFileSync(path.join(repo,'firebase',name),path.join(__dirname,name));
}
for (const [name,contents] of Object.entries({'.env.local':'FEASTA_V2_DRAFT_DEMO_ENABLED=true\n',
 '.secret.local':'CLOUDINARY_CLOUD_NAME=test\nCLOUDINARY_API_KEY=demo-only\nCLOUDINARY_API_SECRET=demo-only\n'})) {
 const target=path.join(__dirname,name);
 if (fs.existsSync(target)) {
  // Preserve existing demo fixtures, including Windows line endings.
  if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== contents) {
   throw new Error('Unexpected local fixture: ' + name);
  }
 } else fs.writeFileSync(target, contents);
}
console.log('Prepared demo-only rules and placeholder secrets. Run the isolated native test config with a demo project.');
