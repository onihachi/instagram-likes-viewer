const {test} = require('node:test');
const assert = require('node:assert/strict');
const {harness, likes, wait} = require('./harness.cjs');

test('一覧の同一DOMとイベント・窓と入れ子の位置を保ち、クリック遷移を阻止', async () => {
  const h = harness(); h.activate();
  const source = h.doc.querySelector('#one'), scroller = h.doc.querySelector('.scroller');
  Object.defineProperties(scroller, {scrollHeight:{value:4000},clientHeight:{value:500}});
  scroller.scrollTop = 1294; h.win.scrollY = 782;
  let handled = 0; source.addEventListener('click', () => handled++);
  const event = h.click(source.querySelector('img'));
  assert.equal(event.defaultPrevented, true); assert.equal(handled, 0);
  assert.equal(h.win.location.href, likes); assert.equal(h.shadow.querySelector('dialog').open, true);
  const ready = h.frameReady(); assert.equal(h.shadow.querySelector('.message').hidden, true);
  scroller.scrollTop = 0; h.win.scrollY = 0;
  h.click(h.shadow.querySelector('.close')); await wait();
  assert.equal(h.shadow.querySelector('dialog').open, false); assert.equal(h.shadow.querySelector('iframe'), null);
  assert.equal(scroller.scrollTop, 1294); assert.equal(h.win.scrollY, 782);
  assert.equal(h.doc.querySelector('#one'), source); assert.equal(h.doc.activeElement, source); assert.equal(ready.pauses, 1);
  h.activate(); h.click(source); assert.equal(handled, 1); h.close();
});
test('連続20回の開閉でフレーム・履歴・ロックが残らない', async () => {
  const h = harness(); h.win.history.replaceState({idx:4,key:'native'}, '', likes); h.activate();
  const source = h.doc.querySelector('#one');
  for (let i = 0; i < 20; i++) {
    h.win.scrollY = 200 + i * 97; const y = h.win.scrollY;
    h.click(source); const ready = h.frameReady();
    h.click(h.shadow.querySelector('.close')); h.click(h.shadow.querySelector('.close')); await wait();
    assert.equal(h.shadow.querySelectorAll('iframe').length, 0); assert.equal(h.win.scrollY, y);
    assert.equal(ready.pauses, 1); assert.equal(h.doc.documentElement.style.overflow, '');
    assert.deepEqual(JSON.parse(JSON.stringify(h.win.history.state)), {idx:4,key:'native'});
  }
  assert.equal(h.win.history.length, 2); h.close();
});
test('戻るで閉じ、進むで同じ投稿を再表示し、サイトの履歴stateを保持', async () => {
  const h = harness(); h.win.history.replaceState({idx:8,usr:{sort:'old'}}, '', likes); h.activate();
  h.win.scrollY = 2091; h.click(h.doc.querySelector('#one')); h.frameReady();
  assert.equal(h.win.history.state.idx, 8);
  h.win.history.back(); await wait();
  assert.equal(h.shadow.querySelector('dialog').open, false); assert.equal(h.win.scrollY, 2091);
  h.win.history.forward(); await wait();
  assert.equal(h.shadow.querySelector('dialog').open, true); assert.equal(h.shadow.querySelector('iframe').src, 'https://www.instagram.com/p/POST_1/');
  h.frameReady(); h.win.history.back(); await wait(); h.close();
});
test('閉じる直後の次投稿クリックを待機させ、元の一覧を遷移させない', async () => {
  const h = harness(); h.activate(); h.click(h.doc.querySelector('#one')); h.frameReady();
  h.click(h.shadow.querySelector('.close'));
  const second = h.click(h.doc.querySelector('#two'));
  assert.equal(second.defaultPrevented,true);
  await wait(); assert.equal(h.win.location.href,likes); assert.equal(h.shadow.querySelector('dialog').open,true);
  assert.equal(h.shadow.querySelector('iframe').src,'https://www.instagram.com/reel/POST_2/');
  h.frameReady();h.click(h.shadow.querySelector('.close'));await wait();h.close();
});
test('親と投稿フレーム内のEsc・native cancelで閉じ、動画を止める', async () => {
  const h = harness(); h.activate();
  h.click(h.doc.querySelector('#two')); let ready = h.frameReady();
  ready.doc.dispatchEvent(new ready.frame.contentWindow.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(); assert.equal(ready.pauses, 1); assert.equal(h.shadow.querySelector('dialog').open, false);
  h.click(h.doc.querySelector('#one')); ready = h.frameReady();
  h.doc.dispatchEvent(new h.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(); assert.equal(ready.pauses, 1);
  h.click(h.doc.querySelector('#one')); h.frameReady();
  const cancel = new h.win.Event('cancel',{cancelable:true}); h.shadow.querySelector('dialog').dispatchEvent(cancel);
  await wait(); assert.equal(cancel.defaultPrevented,true); assert.equal(h.shadow.querySelector('dialog').open,false); h.close();
});
test('Cmdクリックとチェック選択は通常操作を維持', () => {
  const h = harness(); h.activate();
  assert.equal(h.click(h.doc.querySelector('#one'),{metaKey:true}).defaultPrevented,false);
  assert.equal(h.shadow.querySelector('dialog').open,false);
  const checkbox = h.doc.createElement('div'); checkbox.setAttribute('role','checkbox'); h.doc.querySelector('main').append(checkbox);
  assert.equal(h.click(h.doc.querySelector('#one')).defaultPrevented,false); h.close();
});
test('読み込み済みの追加ノードが保持され、次の投稿も開く', async () => {
  const h = harness(); h.activate();
  const added = h.doc.createElement('a'); added.href = '/p/OLDER_3/'; added.textContent = '追加投稿'; h.doc.querySelector('.scroller').append(added);
  await wait(160); assert.match(h.shadow.querySelector('.hint').textContent,/3 件/);
  h.click(added); h.frameReady(); h.click(h.shadow.querySelector('.close')); await wait();
  assert.equal(h.doc.querySelector('a[href="/p/OLDER_3/"]'), added); h.close();
});
test('削除・ログイン・読み込みエラーは一覧を保ち、再試行できる', async () => {
  for (const fixture of ['<p>Sorry, this page isn\'t available.</p>','<form><input type="password"></form>']) {
    const h = harness(); h.activate(); h.click(h.doc.querySelector('#one')); const ready = h.frameReady(fixture);
    assert.equal(h.shadow.querySelector('iframe'), null); assert.equal(h.shadow.querySelector('.retry').hidden,false);
    assert.equal(h.doc.querySelectorAll('main a').length,2); assert.equal(h.win.location.href,likes);
    h.click(h.shadow.querySelector('.retry')); h.frameReady(); assert.equal(h.shadow.querySelector('.message').hidden,true);
    h.click(h.shadow.querySelector('.close')); await wait(); assert.equal(ready.pauses,0); h.close();
  }
  const h = harness(); h.activate(); h.click(h.doc.querySelector('#one'));
  h.shadow.querySelector('iframe').dispatchEvent(new h.win.Event('error'));
  assert.match(h.shadow.querySelector('.error-title').textContent,/失敗/); h.close();
});
test('15秒タイムアウトとアクセス不能frameを安全に終了', () => {
  const h = harness(); const realTimeout = h.win.setTimeout; let timeout;
  h.win.setTimeout = (fn, ms) => { if(ms === 15000) {timeout=fn;return 999999;} return realTimeout(fn,ms); };
  h.activate(); h.click(h.doc.querySelector('#one')); timeout();
  assert.equal(h.shadow.querySelector('iframe'),null); assert.match(h.shadow.querySelector('.error-title').textContent,/確認できません/);
  h.click(h.shadow.querySelector('.retry'));
  const frame = h.shadow.querySelector('iframe'); Object.defineProperty(frame,'contentDocument',{get(){throw new Error('blocked');}});
  frame.dispatchEvent(new h.win.Event('load'));
  assert.equal(h.shadow.querySelector('iframe'),null); assert.match(h.shadow.querySelector('.error-title').textContent,/表示できません/); h.close();
});
test('投稿内リンクは親・子の履歴を増やさず別タブ導線を示す', async () => {
  const h = harness(); h.activate(); h.click(h.doc.querySelector('#one'));
  const ready = h.frameReady('<article><a href="/someone/">作者</a><video></video></article>');
  const event = new ready.frame.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true,button:0}); ready.doc.querySelector('a').dispatchEvent(event);
  assert.equal(event.defaultPrevented,true); assert.match(h.shadow.querySelector('footer').textContent,/別タブ/);
  h.click(h.shadow.querySelector('.external')); await wait();
  assert.equal(h.messages[0].url,'https://www.instagram.com/p/POST_1/'); assert.equal(ready.pauses,1); assert.equal(h.shadow.querySelector('dialog').open,false); h.close();
});
test('拡張通信エラーでも閉じるボタンが使える', async () => {
  const h = harness(); h.activate(); h.click(h.doc.querySelector('#one')); h.frameReady();
  h.win.chrome.runtime.sendMessage = async () => {throw new Error('extension invalidated');};
  h.click(h.shadow.querySelector('.external')); await wait();
  assert.match(h.shadow.querySelector('.error-title').textContent,/別タブを開けません/);
  assert.equal(h.shadow.querySelector('.external').disabled,false);
  h.click(h.shadow.querySelector('.close')); await wait(); assert.equal(h.shadow.querySelector('dialog').open,false); h.close();
});
test('別タブ応答が遅れても後から開いた別の投稿を閉じない', async () => {
  const h = harness();h.activate();h.click(h.doc.querySelector('#one'));h.frameReady();
  let resolve;h.win.chrome.runtime.sendMessage=()=>new Promise(done=>resolve=done);
  h.click(h.shadow.querySelector('.external'));h.click(h.shadow.querySelector('.close'));await wait();
  h.click(h.doc.querySelector('#two'));h.frameReady();resolve({ok:true});await wait();
  assert.equal(h.shadow.querySelector('dialog').open,true);
  assert.equal(h.shadow.querySelector('iframe').src,'https://www.instagram.com/reel/POST_2/');
  h.win.chrome.runtime.sendMessage=async()=>({ok:true});h.close();
});
test('投稿本文にエラーと同じ言葉があっても正常なarticleをエラー扱いしない', () => {
  const h=harness();h.activate();h.click(h.doc.querySelector('#one'));
  h.frameReady('<article><p>Something went wrongというタイトルの投稿</p></article>');
  assert.equal(h.shadow.querySelector('.message').hidden,true);assert.ok(h.shadow.querySelector('iframe'));h.close();
});
test('履歴push失敗ならリンクを横取りせず、ロックとフレームを解除', () => {
  const h = harness(); h.activate(); h.win.history.pushState = () => {throw new Error('history blocked');};
  const event = h.click(h.doc.querySelector('#one')); assert.equal(event.defaultPrevented,false);
  assert.equal(h.shadow.querySelector('dialog').open,false); assert.equal(h.shadow.querySelector('iframe'),null); assert.equal(h.doc.documentElement.style.overflow,''); h.close();
});
test('多重起動は停止になり、SPAルート変更・pagehideで読み取りとframeを終了', async () => {
  const h = harness(); assert.equal(h.activate().enabled,true); assert.equal(h.activate().enabled,false);
  assert.equal(h.doc.querySelector('ig-likes-viewer'),null); h.activate(); h.click(h.doc.querySelector('#one')); const ready = h.frameReady();
  h.win.history.pushState({},'', '/your_activity/interactions/comments/'); await wait(550);
  assert.equal(h.doc.querySelector('ig-likes-viewer'),null); assert.equal(ready.pauses,1); assert.equal(h.win.__IGLV_APP__,undefined); h.close();
  const page = harness(); page.activate(); page.click(page.doc.querySelector('#one')); const video = page.frameReady();
  page.win.dispatchEvent(new page.win.Event('pagehide')); assert.equal(video.pauses,1); assert.equal(page.doc.querySelector('ig-likes-viewer'),null); page.close();
});
test('想定外のルートやリンク構造に起動・横取りしない', () => {
  const h = harness('https://www.instagram.com/'); assert.equal(h.activate().enabled,false); assert.equal(h.doc.querySelector('ig-likes-viewer'),null); h.close();
  const unknown = harness(likes,'<div role="button">hrefを持たない投稿</div>'); unknown.activate();
  assert.match(unknown.shadow.querySelector('.hint').textContent,/見つかりません/); assert.equal(unknown.click(unknown.doc.querySelector('[role="button"]')).defaultPrevented,false); unknown.close();
});
