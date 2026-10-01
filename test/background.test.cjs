const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {sources, likes} = require('./harness.cjs');
function worker() {
  const calls = []; let click, message;
  const chrome = {
    action:{onClicked:{addListener(fn){click=fn;}},
      setBadgeText: async value=>calls.push(['badge',value]), setBadgeBackgroundColor:async ()=>{}, setTitle:async value=>calls.push(['title',value])},
    scripting:{executeScript: async value=> {calls.push(['inject',value]);return [{result:{enabled:true}}];}},
    runtime:{onMessage:{addListener(fn){message=fn;}}},
    tabs:{create:async value=>calls.push(['create',value])}
  };
  const context = vm.createContext({URL,chrome,self:null});context.self=context;
  context.importScripts = () => vm.runInContext(sources['core.js'],context);
  vm.runInContext(sources['background.js'],context);
  return {calls,chrome,click,message};
}
test('actionは明示クリックした公式一覧のmain frameへだけ注入', async () => {
  const w=worker(); await w.click({id:3,url:likes});
  const injection=w.calls.find(([type])=>type==='inject')[1];
  assert.deepEqual(JSON.parse(JSON.stringify(injection)), {target:{tabId:3},files:['core.js','content.js'],world:'ISOLATED'});
  assert.equal(w.calls.find(([type])=>type==='badge')[1].text,'ON');
});
test('別サイト・違うInstagram画面・注入失敗は説明付きエラーバッジ', async () => {
  for(const url of ['https://example.com/', 'https://www.instagram.com/']) {
    const w=worker();await w.click({id:1,url});assert.equal(w.calls.some(([type])=>type==='inject'),false);assert.equal(w.calls[0][1].text,'!');
  }
  const w=worker();w.chrome.scripting.executeScript=async()=>{throw new Error('no access');};await w.click({id:1,url:likes});
  assert.equal(w.calls.find(([type])=>type==='badge')[1].text,'!');assert.match(w.calls.find(([type])=>type==='title')[1].title,/起動できません/);
});
test('別タブ要求の送信元、origin、ルートを再検証', async () => {
  for(const [url,sender] of [
    ['https://evil.test/p/X/',{frameId:0,tab:{id:1,url:likes}}],
    ['/p/X/',{frameId:1,tab:{id:1,url:likes}}],
    ['/p/X/',{frameId:0,tab:{id:1,url:'https://www.instagram.com/'}}],
    ['/p/X/',{}]
  ]) {const w=worker();let result;w.message({type:'IGLV_OPEN_POST',url},sender,value=>result=value);assert.equal(result.ok,false);assert.equal(w.calls.length,0);}
  const w=worker();let result;assert.equal(w.message({type:'IGLV_OPEN_POST',url:'/p/X/?tracking=1'},{frameId:0,tab:{id:1,url:likes}},value=>result=value),true);
  await Promise.resolve();assert.equal(result.ok,true);assert.equal(w.calls[0][1].url,'https://www.instagram.com/p/X/');
});
test('別タブ作成失敗は成功と報告せず、停止通知でバッジ解除', async () => {
  const w=worker();w.chrome.tabs.create=async()=>{throw new Error('blocked');};let result;
  w.message({type:'IGLV_OPEN_POST',url:'/p/X/'},{frameId:0,tab:{id:1,url:likes}},value=>result=value);
  await Promise.resolve();assert.equal(result.ok,false);
  w.message({type:'IGLV_STOPPED'},{frameId:0,tab:{id:1,url:likes}},()=>{});await Promise.resolve();
  assert.equal(w.calls.find(([type])=>type==='badge')[1].text,'');
});
