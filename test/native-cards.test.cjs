const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {harness, likes, wait} = require('./harness.cjs');
const card = '<article><div id="wrapper"><div role="button" aria-label="アイテム2件のカルーセル、4/9件、作成者: @example、September 18, 2026にシェア" style="pointer-events:none"><img src="https://scontent.example.test/photo.jpg?ig_cache_key=Mzk4OTEwMTk2NzE5NzAyMTkyMQ==.3-ccb7-5&amp;oh=signature"></div></div></article>';

test('表示された画像IDを精度を失わず公式投稿URLへ変換し、未知の識別子を拒否', () => {
  const h=harness(likes,card);const C=h.win.IGLikesCore;const source=h.doc.querySelector('[role="button"]');
  assert.equal(C.cardPostUrl(source),'https://www.instagram.com/p/DdcIxqflybh/');
  const img=source.querySelector('img');
  img.src='https://scontent.example.test/photo.jpg?ig_cache_key='+h.win.btoa('3994644141719375265_18126893087482785');
  assert.match(C.cardPostUrl(source),/^https:\/\/www.instagram.com\/p\/[A-Za-z0-9_-]+\/$/);
  for (const decoded of ['bad','12','-3996802146405565446','3996802146405565446<script>']) {
    img.src='https://scontent.example.test/photo.jpg?ig_cache_key='+h.win.btoa(decoded);
    assert.equal(C.cardPostUrl(source),null);
  }
  img.src='https://scontent.example.test/photo.jpg';assert.equal(C.cardPostUrl(source),null);h.close();
});

test('hrefなしカードのクリック領域だけを識別し、body・フィルター・選択モードは除外', () => {
  const h=harness(likes,card);const C=h.win.IGLikesCore;const wrapper=h.doc.querySelector('#wrapper');
  assert.equal(C.findPostCard([wrapper],h.doc).url,'https://www.instagram.com/p/DdcIxqflybh/');
  assert.equal(C.findPostCard([h.doc.body],h.doc),null);
  h.doc.querySelector('main').insertAdjacentHTML('afterbegin','<div role="button" id="filter" aria-label="並び替えとフィルター"></div>');
  assert.equal(C.findPostCard([h.doc.querySelector('#filter')],h.doc),null);
  h.doc.querySelector('main').insertAdjacentHTML('beforeend','<div role="checkbox"></div>');
  assert.equal(C.findPostCard([wrapper],h.doc),null);h.close();
});

async function popupHarness() {
  const h=harness(likes,card);
  const child=new JSDOM('<main><article>公式投稿<video></video></article></main>',{url:'https://www.instagram.com/p/DemoParent001/',pretendToBeVisual:true});
  const popup=child.window;const originalClose=popup.close.bind(popup);let closed=false,pauses=0,openedUrl;
  Object.defineProperty(popup,'closed',{get:()=>closed});popup.focus=()=>{};popup.close=()=>{closed=true;};
  popup.document.querySelector('video').pause=()=>pauses++;
  h.win.open=(url)=>{openedUrl=url;return popup;};
  const scroller=h.doc.querySelector('.scroller');Object.defineProperties(scroller,{clientHeight:{value:400},scrollHeight:{value:3000}});
  scroller.scrollTop=1777;const source=h.doc.querySelector('#wrapper');
  h.activate();assert.equal(h.click(source).defaultPrevented,true);
  await wait(400);
  return {h,popup,source,scroller,get openedUrl(){return openedUrl;},get closed(){return closed;},get pauses(){return pauses;},close(){h.close();originalClose();}};
}

test('カードから公式投稿を直接開き、Escで動画停止・終了・親位置と同じDOMを保持', async () => {
  const p=await popupHarness();
  assert.equal(p.openedUrl,'https://www.instagram.com/p/DdcIxqflybh/');
  assert.equal(p.h.shadow.querySelector('iframe'),null);
  assert.equal(p.h.win.history.length,1);
  p.popup.document.dispatchEvent(new p.popup.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(p.closed,true);assert.equal(p.pauses,1);assert.equal(p.scroller.scrollTop,1777);
  assert.equal(p.h.doc.querySelector('#wrapper'),p.source);p.close();
});

test('×ボタンとウィンドウ自体の閉鎖でも元の一覧位置へ復帰', async () => {
  const p=await popupHarness();
  p.popup.document.querySelector('button[aria-label="投稿を閉じて元のいいね一覧に戻る"]').click();
  assert.equal(p.closed,true);assert.equal(p.scroller.scrollTop,1777);p.close();
});


test('連結IDを表示投稿日で切り分け、異なる日付や曖昧な形式は拒否', () => {
  const h=harness(likes,card);const C=h.win.IGLikesCore;const source=h.doc.querySelector('[role="button"]');
  source.setAttribute('aria-label','動画、2/9件、作成者: @example、September 2, 2026にシェア');
  source.querySelector('img').src='https://scontent.example.test/video.jpg?ig_cache_key=Mzk3NzQxNDc1ODE5NzM2OTk0NTE4MTAwMDAwMDAwMDAwMDAwMA.3-ccb7-5';
  assert.equal(C.cardPostUrl(source),'https://www.instagram.com/p/DcynaY6wBxZ/');
  source.setAttribute('aria-label','動画、2/9件、作成者: @example、September 2, 2025にシェア');
  assert.equal(C.cardPostUrl(source),null);h.close();
});


test('識別できない実カードでは親一覧を遷移させず、位置を守って停止を案内', () => {
  const h=harness(likes,card);h.doc.querySelector('img').src='https://scontent.example.test/unknown.jpg';
  h.activate();assert.equal(h.click(h.doc.querySelector('#wrapper')).defaultPrevented,true);
  assert.match(h.shadow.querySelector('.hint').textContent,/一覧の位置を保持/);
  assert.equal(h.win.location.href,likes);h.close();
});
