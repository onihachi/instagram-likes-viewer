const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..','extension');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(manifest.permissions,['activeTab','scripting']);
for(const key of ['host_permissions','optional_host_permissions','content_scripts','externally_connectable','web_accessible_resources']) assert.equal(manifest[key],undefined,key);
for(const file of ['core.js','content.js','background.js']) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/,file+' direct networking');
  assert.doesNotMatch(source,/document\.cookie|localStorage|sessionStorage|chrome\.(cookies|storage|webRequest|debugger)/,file+' sensitive/persistent access');
}
console.log('MV3 manifest / activeTab+scripting only / no persistent host access / no direct networking or persistent storage: PASS');
