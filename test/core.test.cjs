const {test} = require('node:test');
const assert = require('node:assert/strict');
const {harness, likes} = require('./harness.cjs');

test('起動対象はHTTPSの公式いいねルートだけ', () => {
  const h = harness(); const C = h.win.IGLikesCore;
  assert.equal(C.isLikesLocation(likes + '?sort=oldest'), true);
  for (const url of ['http://www.instagram.com/your_activity/interactions/likes/',
    'https://www.instagram.com.evil.test/your_activity/interactions/likes/',
    'https://www.instagram.com/your_activity/interactions/comments/',
    'https://www.instagram.com:444/your_activity/interactions/likes/',
    'https://user@www.instagram.com/your_activity/interactions/likes/', 'bad']) assert.equal(C.isLikesLocation(url), false);
  h.close();
});
test('通常の投稿URLだけ正規化し、外部・認証・別origin・余分なパスを拒否', () => {
  const h = harness(); const C = h.win.IGLikesCore;
  assert.equal(C.normalizePostUrl('/p/Abc_-123/?igsh=secret#x', likes), 'https://www.instagram.com/p/Abc_-123/');
  assert.equal(C.normalizePostUrl('/reel/X', likes), 'https://www.instagram.com/reel/X/');
  for (const url of ['javascript:alert(1)', 'https://evil.test/p/X/', '//evil.test/p/X/',
    'https://instagram.com/p/X/', 'https://me:pass@www.instagram.com/p/X/',
    '/accounts/login/', '/p/X/embed/', '/p/%2e%2e/', '/p/X/extra/', '/p/']) assert.equal(C.normalizePostUrl(url, likes), null);
  h.close();
});
test('修飾クリック、通常でないボタン、既に処理済みの操作を尊重', () => {
  const h = harness(); const C = h.win.IGLikesCore;
  const event = {button: 0}; assert.equal(C.plainActivation(event), true);
  for (const options of [{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}]) assert.equal(C.plainActivation({...event,...options}), false);
  h.close();
});
test('main外のリンク・選択チェックボックスがある一覧は横取りしない', () => {
  const h = harness(); const C = h.win.IGLikesCore;
  const external = h.doc.createElement('a'); external.href = '/p/EXTERNAL/'; h.doc.body.append(external);
  assert.equal(C.findPostLink([external], h.doc, likes), null);
  const source = h.doc.querySelector('a'); assert.equal(C.findPostLink([source], h.doc, likes).link, source);
  const checkbox = h.doc.createElement('input'); checkbox.type = 'checkbox'; h.doc.querySelector('main').append(checkbox);
  assert.equal(C.findPostLink([source], h.doc, likes), null);
  h.close();
});
test('DOMに残る投稿URL数のみ数え、重複や不正リンクは除外', () => {
  const h = harness(likes, '<a href="/p/X/">1</a><a href="/p/X/?a=1">2</a><a href="/accounts/login/">3</a>');
  assert.equal(h.win.IGLikesCore.loadedPostLinks(h.doc, likes), 1); h.close();
});
test('窓と入れ子スクロール、元のinlineスタイルを復元', () => {
  const h = harness(); const C = h.win.IGLikesCore;
  const scroller = h.doc.querySelector('.scroller');
  Object.defineProperties(scroller, {scrollHeight:{value:2000},clientHeight:{value:400}});
  scroller.scrollTop = 831; scroller.scrollLeft = 22;
  scroller.style.cssText = 'overflow-y: auto !important; color: red;';
  h.win.scrollY = 1450;
  const snapshot = C.snapshotScroll(h.win, h.doc.querySelector('a'));
  const unlock = C.lockScroll(snapshot);
  assert.equal(scroller.style.overflow, 'hidden');
  scroller.scrollTop = 0; h.win.scrollY = 0; scroller.style.backgroundColor = 'blue';
  unlock(); C.restoreScroll(h.win, snapshot);
  assert.equal(scroller.scrollTop, 831); assert.equal(scroller.scrollLeft, 22); assert.equal(h.win.scrollY, 1450);
  assert.equal(scroller.style.overflowY, 'auto'); assert.equal(scroller.style.getPropertyPriority('overflow-y'), 'important');
  assert.equal(scroller.style.color, 'red'); assert.equal(scroller.style.backgroundColor, 'blue'); h.close();
});
