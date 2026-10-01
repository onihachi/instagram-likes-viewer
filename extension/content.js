(function () {
  'use strict';
  const APP_KEY = '__IGLV_APP__';
  if (self[APP_KEY]) {
    self[APP_KEY].destroy(true);
    return {enabled: false};
  }
  const C = self.IGLikesCore;
  if (!C?.isLikesLocation(location.href) || window !== window.top) return {enabled: false};
  const baseUrl = location.href;
  const session = crypto.randomUUID();
  const records = new Map();
  const resolvedCards = new Map();
  const popupCleanups = new Set();
  let enabled = true, current = null, pendingBack = false, queuedOpen = null, refreshTimer = null;
  let backTimer = null, restoreGeneration = 0;
  const host = document.createElement('ig-likes-viewer');
  const shadow = host.attachShadow({mode: 'closed'});
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;left:18px;bottom:18px;z-index:2147483646;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;color:#eaf1ed;color-scheme:dark}
      *{box-sizing:border-box} button{font:inherit;cursor:pointer;border:1px solid #53645c;border-radius:9px;background:#263a31;color:#f1f5f2;padding:9px 14px} button:hover{background:#375144} button:focus-visible{outline:3px solid #b7dec4;outline-offset:3px} button:disabled{cursor:wait;opacity:.5}
      .dock{max-width:340px;padding:12px 15px;background:#172a22;box-shadow:0 6px 25px #0004;border:1px solid #496052;border-radius:14px}.row{display:flex;align-items:center;justify-content:space-between;gap:14px}.dock button{font-size:12px;padding:5px 9px}.hint{margin:5px 0 0;font-size:12px;color:#c6d6cc}.layout-controls{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}.layout-controls label{display:flex;align-items:center;gap:6px;font-size:12px}.size{width:110px}.columns{font-size:12px}.brand{font-weight:700;letter-spacing:.04em}
      dialog{width:min(1240px,calc(100vw - 40px));height:calc(100dvh - 40px);max-width:none;max-height:none;margin:auto;padding:0;border:1px solid #53645c;border-radius:16px;background:#101b16;color:#f2f5f3;box-shadow:0 24px 90px #0008;overflow:hidden;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif}
      dialog:not([open]){display:none}dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:rgba(7,14,10,.82);backdrop-filter:blur(3px)}
      header{flex:none;padding:12px 18px;display:flex;gap:16px;align-items:center;justify-content:space-between;background:#182b22;border-bottom:1px solid #35483e}h2{font-size:16px;line-height:1.5;margin:0}.meta{font-size:12px;color:#c3d4c9}.actions{display:flex;align-items:center;gap:8px}.close{background:#e6f1e9;color:#14251c;font-weight:700;border-color:#e6f1e9}.close:hover{background:#fff}.body{flex:1;min-height:0;position:relative;background:#fff}iframe{width:100%;height:100%;display:block;border:0;background:#fff}.message{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;background:#101b16;padding:30px;gap:12px}.message[hidden]{display:none}.message p{max-width:530px;margin:0;color:#c5d5cb}.error-title{font-size:18px;font-weight:700}footer{padding:7px 18px;color:#c3d4c9;font-size:12px;border-top:1px solid #35483e;flex:none}.retry[hidden]{display:none}
      @media(max-width:700px){dialog{width:calc(100vw - 12px);height:calc(100dvh - 12px);border-radius:10px}header{padding:10px;gap:8px;align-items:flex-start}.actions{flex-wrap:wrap;justify-content:flex-end}button{padding:8px 10px}.meta{max-width:150px}.dock{max-width:calc(100vw - 36px)}}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
    </style>
    <div class="dock"><div class="row"><span class="brand">いいねビュー · ON</span><button class="stop" type="button">停止</button></div><p class="hint" role="status" aria-live="polite"></p><div class="layout-controls"><label>サムネイル <input class="size" type="range" min="180" max="460" step="20" value="280" aria-label="サムネイルの大きさ"></label><span class="columns"></span><button class="layout-toggle" type="button">元の一覧</button></div></div>
    <dialog aria-labelledby="iglv-title" aria-describedby="iglv-description">
      <header><div><h2 id="iglv-title">いいねの投稿</h2><div class="meta" id="iglv-description">閉じると一覧の同じ位置へ</div></div><div class="actions"><button class="retry" type="button" hidden>再試行</button><button class="popup" type="button" hidden>別ウィンドウで表示 ↗</button><button class="external" type="button">別タブで開く ↗</button><button class="close" type="button" aria-label="投稿を閉じて一覧に戻る">閉じる <small>Esc</small></button></div></header>
      <div class="body"><div class="message" role="status" aria-live="polite"><span class="error-title"></span><p></p></div></div>
      <footer>公式の投稿ページを表示します。一覧はこのタブに残っています。</footer>
    </dialog>`;
  const dialog = shadow.querySelector('dialog');
  const dock = shadow.querySelector('.dock');
  const hint = shadow.querySelector('.hint');
  const body = shadow.querySelector('.body');
  const message = shadow.querySelector('.message');
  const closeButton = shadow.querySelector('.close');
  const externalButton = shadow.querySelector('.external');
  const popupButton = shadow.querySelector('.popup');
  const retryButton = shadow.querySelector('.retry');
  document.body.appendChild(host);
  const layout = self.IGLikesLayout?.(document, {slider:shadow.querySelector('.size'),toggle:shadow.querySelector('.layout-toggle'),output:shadow.querySelector('.columns')});

  function showMessage(title, detail, error = false) {
    message.hidden = false;
    message.querySelector('span').textContent = title;
    message.querySelector('p').textContent = detail;
    retryButton.hidden = !error;
  }
  function refreshHint() {
    if (!enabled) return;
    const count = C.loadedPostLinks(document, baseUrl) + C.postCards(document).length;
    hint.textContent = count ? `表示中の投稿 ${count} 件 · クリックで大きく開く` :
      '対応する投稿が見つかりません。選択モードを終了して一覧を確認してください。';
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshHint, 120);
  }
  const pageObserver = new MutationObserver(scheduleRefresh);
  pageObserver.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'aria-label']});
  refreshHint();

  function ownedRecord() {
    const marker = history.state?.[C.HISTORY_KEY];
    return marker?.session === session && records.get(marker.id);
  }
  function cleanupFrame(view) {
    clearTimeout(view.timeout);
    view.observer?.disconnect();
    for (const cleanup of view.listeners || []) cleanup();
    view.listeners = [];
    try { C.pauseMedia(view.frame?.contentDocument); } catch { /* May be inaccessible after a redirect. */ }
    if (view.frame) {
      view.frame.remove();
      view.frame = null;
    }
  }
  function fail(view, title, detail) {
    if (current !== view) return;
    cleanupFrame(view);
    popupButton.hidden = !view.record.native;
    showMessage(title, detail, true);
    closeButton.focus({preventScroll: true});
  }
  function frameFocusables(doc) {
    return [...doc.querySelectorAll('button,a[href],input,textarea,select,[tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
  }
  function loadFrame(view) {
    cleanupFrame(view);
    showMessage('投稿を読み込み中…', '少し時間がかかる場合も、閉じる・Escですぐ一覧へ戻れます。');
    const frame = document.createElement('iframe');
    view.frame = frame;
    frame.title = 'Instagramの投稿詳細';
    // Same-origin official page. Top navigation is withheld to preserve the list.
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    frame.setAttribute('allow', 'fullscreen; picture-in-picture');
    frame.referrerPolicy = 'same-origin';
    externalButton.disabled = !view.record.url;
    frame.addEventListener('load', () => {
      if (current !== view || view.frame !== frame) return;
      view.observer?.disconnect();
      for (const cleanup of view.listeners) cleanup();
      view.listeners = [];
      let doc;
      try {
        doc = frame.contentDocument;
        if (!doc) throw new Error('frame contentDocument is null');
        if (frame.contentWindow.location.origin !== location.origin) throw new Error('frame origin differs from parent');
        if (frame.contentWindow.location.href === 'about:blank') return;
      } catch (error) {
        host.setAttribute('data-frame-error', String(error.name) + ': ' + String(error.message).slice(0, 300));
        fail(view, 'この枠では表示できません', '埋め込みが制限されている可能性があります。「別タブで開く」で公式ページを表示できます。');
        return;
      }
      const onFrameKey = event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopImmediatePropagation(); requestClose();
        } else if (event.key === 'Tab') {
          const controls = frameFocusables(doc);
          if (!controls.length || (!event.shiftKey && doc.activeElement === controls.at(-1))) {
            event.preventDefault(); closeButton.focus();
          } else if (event.shiftKey && doc.activeElement === controls[0]) {
            event.preventDefault(); externalButton.focus();
          }
        }
      };
      const onFrameLink = event => {
        if (!C.plainActivation(event)) return;
        const link = event.target?.closest?.('a[href]');
        if (!link || link.getAttribute('href')?.startsWith('#') || C.isLikesLocation(frame.contentWindow.location.href)) return;
        // Navigation in the child could add joint browser-history entries.
        event.preventDefault(); event.stopImmediatePropagation();
        shadow.querySelector('footer').textContent = '投稿内のリンクをたどるときは「別タブで開く」を使ってください。';
      };
      doc.addEventListener('keydown', onFrameKey, true);
      doc.addEventListener('click', onFrameLink, true);
      view.listeners.push(() => doc.removeEventListener('keydown', onFrameKey, true),
        () => doc.removeEventListener('click', onFrameLink, true));
      // Child navigation must not add entries to the top-level joint history.
      // The official router still sees its own changed URL and state.
      const childHistory = frame.contentWindow.history;
      const originalPush = childHistory.pushState;
      childHistory.pushState = function (state, unused, url) {
        return childHistory.replaceState(state, unused, url);
      };
      view.listeners.push(() => { childHistory.pushState = originalPush; });
      function inspect() {
        if (current !== view || view.frame !== frame) return;
        let childUrl;
        try { childUrl = frame.contentWindow.location.href; } catch { childUrl = ''; }
        const text = (doc.body?.textContent || '').slice(0, 20000);
        const contentReady = doc.querySelector('article') || [...doc.querySelectorAll('main img,main video')].some(node => node.getBoundingClientRect().width >= 200);
        if (doc.querySelector('input[type="password"]') || /\/accounts\/login\b/.test(childUrl)) {
          fail(view, 'ログインが必要です', '「別タブで開く」で公式ページを確認してください。一覧の位置はこのタブに残ります。');
        } else if (!contentReady && /Sorry, this page isn't available|This page isn't available|このページはご利用いただけません|ページが見つかりません|Something went wrong|問題が発生しました/i.test(text)) {
          fail(view, '投稿を表示できません', '削除・公開範囲・一時的なエラーの可能性があります。再試行または別タブで確認できます。');
        } else if (C.normalizePostUrl(childUrl, baseUrl) !== view.record.url) {
          fail(view, '表示先が変わりました', '元の一覧を守るため、この枠の表示を停止しました。別タブで公式ページを開けます。');
        } else if (contentReady) {
          message.hidden = true;
          clearTimeout(view.timeout);
        }
      }
      view.observer = new MutationObserver(inspect);
      view.observer.observe(doc.documentElement, {childList: true, subtree: true});
      const inspectTimer = setInterval(inspect, 350);
      view.listeners.push(() => clearInterval(inspectTimer));
      inspect();
    });
    frame.addEventListener('error', () => fail(view, '読み込みに失敗しました', '再試行するか、別タブで公式ページを開いてください。'));
    view.timeout = setTimeout(() => fail(view, '読み込みを確認できませんでした', '通信または埋め込みの制限が考えられます。再試行・別タブで開くを使えます。'), view.record.native && !view.record.url ? 45000 : 15000);
    frame.src = view.record.url || baseUrl;
    body.prepend(frame);
  }
  function renderOpen(record) {
    if (current) renderClose(false);
    restoreGeneration++;
    const snapshot = C.snapshotScroll(window, record.source?.isConnected ? record.source : document.querySelector('main, [role="main"]'));
    const view = {record, snapshot, unlock: C.lockScroll(snapshot), listeners: [], frame: null};
    current = view;
    popupButton.hidden = true;
    dock.hidden = true;
    shadow.querySelector('footer').textContent = '公式の投稿ページを表示します。一覧はこのタブに残っています。';
    try { dialog.showModal(); } catch {
      view.unlock(); current = null; dock.hidden = false;
      hint.textContent = 'ビューアを開けませんでした。一覧を再読み込みして起動してください。';
      return false;
    }
    closeButton.focus({preventScroll: true});
    loadFrame(view);
    return true;
  }
  function renderClose(restore = true) {
    const view = current;
    if (!view) return;
    current = null;
    cleanupFrame(view);
    dialog.close();
    view.unlock();
    dock.hidden = false;
    const generation = ++restoreGeneration;
    if (restore && location.href === baseUrl) {
      if (view.record.source?.isConnected) view.record.source.focus({preventScroll: true});
      C.restoreScroll(window, view.snapshot);
      requestAnimationFrame(() => {
        if (enabled && !current && generation === restoreGeneration && location.href === baseUrl) C.restoreScroll(window, view.snapshot);
      });
    }
  }
  function requestClose() {
    const record = ownedRecord();
    renderClose();
    if (!record || pendingBack || location.href !== baseUrl) return;
    pendingBack = true;
    try { history.back(); } catch { history.replaceState(record.previousState, '', baseUrl); pendingBack = false; }
    clearTimeout(backTimer);
    backTimer = setTimeout(() => {
      if (pendingBack && ownedRecord() === record && location.href === baseUrl) history.replaceState(record.previousState, '', baseUrl);
      pendingBack = false;
      flushQueuedOpen();
    }, 1200);
  }
  function flushQueuedOpen() {
    const next = queuedOpen;
    queuedOpen = null;
    if (next && enabled && !current && location.href === baseUrl) openPost(next.url, next.source, next.native);
  }
  function openPost(url, source, native = null) {
    if (!enabled || pendingBack || current || location.href !== baseUrl) return false;
    const id = crypto.randomUUID();
    const record = {id, url: resolvedCards.get(native?.key) || url || null, native, source, previousState: history.state};
    records.set(id, record);
    if (records.size > 32) records.delete(records.keys().next().value);
    if (native && openNativePopup(record, C.snapshotScroll(window, source))) return true;
    if (!renderOpen(record)) { records.delete(id); return false; }
    if (native) return true;
    try {
      history.pushState({...history.state, [C.HISTORY_KEY]: {session, id}}, '', baseUrl);
    } catch {
      renderClose(); records.delete(id);
      hint.textContent = '履歴を保持できませんでした。通常のリンク操作に戻しています。';
      return false;
    }
    return true;
  }
  function onClick(event) {
    if (!C.plainActivation(event) || current) return;
    const match = C.findPostLink(event.composedPath(), document, baseUrl) || C.findPostCard(event.composedPath(), document);
    if (!match) return;
    if (!match.url) {
      event.preventDefault(); event.stopImmediatePropagation();
      hint.textContent = 'このカードの表示先を確認できません。一覧の位置を保持しました。通常操作を使う場合は停止してください。';
      return;
    }
    if (pendingBack) {
      queuedOpen = {url: match.url, source: match.link, native: match.native};
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (openPost(match.url, match.link, match.native)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function onPopState() {
    pendingBack = false;
    clearTimeout(backTimer);
    if (location.href !== baseUrl) { destroy(false); return; }
    const record = ownedRecord();
    if (record && current?.record !== record) renderOpen(record);
    else if (!record) renderClose();
    flushQueuedOpen();
  }
  function invalidateRestore() { restoreGeneration++; }
  function onKey(event) {
    if (current && event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); requestClose();
    } else if (current && event.key === 'Tab' && shadow.activeElement === closeButton && !event.shiftKey) {
      event.preventDefault();
      current.frame?.focus();
    }
    invalidateRestore();
  }
  function destroy(rewind = false) {
    layout?.destroy();
    if (!enabled) return;
    if (rewind) requestClose(); else renderClose(location.href === baseUrl);
    enabled = false;
    restoreGeneration++;
    clearTimeout(backTimer); clearTimeout(refreshTimer); clearInterval(routeTimer);
    pageObserver.disconnect();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('wheel', invalidateRestore, true);
    document.removeEventListener('pointerdown', invalidateRestore, true);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pagehide', onPageHide);
    for (const cleanup of [...popupCleanups]) cleanup(true);
    records.clear(); resolvedCards.clear(); queuedOpen = null; host.remove(); delete self[APP_KEY];
    try { chrome.runtime.sendMessage({type: 'IGLV_STOPPED'}).catch(() => {}); } catch { /* Extension may have been unloaded. */ }
  }
  function onPageHide() { destroy(false); }
  function openNativePopup(record, snapshot) {
    const popup = window.open(record.url || baseUrl, '', 'popup,width=1120,height=900');
    if (!popup) {
      showMessage('別ウィンドウを開けませんでした', 'Chromeのポップアップ設定を確認してください。閉じる・Escで一覧に戻れます。', true);
      return false;
    }
    host.setAttribute('data-popup-status', 'opened');
    requestClose();
    host.setAttribute('data-popup-status', 'parent closed');
    let childDoc = null, popupClose = null, postView = null;
    const onPopupKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cleanup(true); }
    };
    function cleanup(close = false) {
      host.setAttribute('data-popup-cleanup', 'closed=' + close);
      clearInterval(timer);
      childDoc?.removeEventListener('keydown', onPopupKey, true);
      popupClose?.remove();
      postView?.destroy();
      try { C.pauseMedia(childDoc); if (close && !popup.closed) popup.close(); } catch { /* Closed or a user navigation. */ }
      popupCleanups.delete(cleanup);
      if (enabled && location.href === baseUrl && !current) {
        record.source?.isConnected && record.source.focus({preventScroll: true});
        C.restoreScroll(window, snapshot);
      }
    }
    function inspectPopup() {
      if (popup.closed) { cleanup(); return; }
      let doc, url;
      try { doc = popup.document; url = popup.location.href; } catch {
        hint.textContent = '公式ウィンドウを表示中です。閉じると元の一覧へ戻れます。';
        return;
      }
      if (!doc || url === 'about:blank') return;
      if (childDoc !== doc) {
        childDoc?.removeEventListener('keydown', onPopupKey, true);
        postView?.destroy();
        postView = null;
        childDoc = doc;
        doc.addEventListener('keydown', onPopupKey, true);
        popupClose = null;
      }
      if (doc.body && !popupClose?.isConnected) {
        popupClose = doc.createElement('button');
        popupClose.type = 'button';
        popupClose.setAttribute('aria-label', '投稿を閉じて元のいいね一覧に戻る');
        popupClose.textContent = '× 閉じる · Esc';
        popupClose.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;background:#e6f1e9;color:#14251c;border:1px solid #53645c;border-radius:10px;padding:12px 16px;font:700 14px system-ui;cursor:pointer;box-shadow:0 3px 18px #0005';
        popupClose.addEventListener('click', () => cleanup(true));
        doc.body.appendChild(popupClose);
      }
      if (doc.body) {
        postView ||= self.IGLikesPostView?.(doc);
        postView?.refresh();
      }
      const postUrl = C.normalizePostUrl(url, baseUrl);
      if (postUrl) {
        record.url = postUrl;
        resolvedCards.set(record.native.key, postUrl);
        hint.textContent = '投稿を別ウィンドウで表示中 · × / Escでこの位置へ戻る';
        return;
      }
      hint.textContent = '公式ウィンドウを表示中 · × / Escで元の一覧へ戻る';
    }
    const timer = setInterval(inspectPopup, 350);
    popupCleanups.add(cleanup);
    popup.focus();
    return true;
  }
  popupButton.addEventListener('click', () => {
    try {
      if (current?.record.native) openNativePopup(current.record, current.snapshot);
    } catch (error) {
      host.setAttribute('data-popup-status', error.name + ': ' + error.message);
    }
  });
  closeButton.addEventListener('click', requestClose);
  shadow.querySelector('.stop').addEventListener('click', () => destroy(true));
  retryButton.addEventListener('click', () => { if (current) loadFrame(current); });
  externalButton.addEventListener('click', async () => {
    if (!current) return;
    const view = current;
    externalButton.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({type: 'IGLV_OPEN_POST', url: view.record.url});
      if (!result?.ok) throw new Error('blocked');
      if (current === view) requestClose();
    } catch {
      if (current === view) {
        cleanupFrame(view);
        showMessage('別タブを開けませんでした', '拡張を更新した場合は、一覧を再読み込みしてから再度起動してください。', true);
      }
    } finally { externalButton.disabled = false; }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('wheel', invalidateRestore, {capture: true, passive: true});
  document.addEventListener('pointerdown', invalidateRestore, {capture: true, passive: true});
  window.addEventListener('popstate', onPopState);
  window.addEventListener('pagehide', onPageHide);
  const routeTimer = setInterval(() => { if (location.href !== baseUrl) destroy(false); }, 500);
  self[APP_KEY] = {destroy};
  return {enabled: true};
})();
