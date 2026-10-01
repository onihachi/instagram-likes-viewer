/* Shared by the isolated content script, service worker, and DOM-only tests. */
(function (scope) {
  'use strict';
  const HISTORY_KEY = '__igLikesViewer_v1__';
  function isInstagramLocation(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
        ['www.instagram.com', 'instagram.com'].includes(url.hostname);
    } catch { return false; }
  }
  function isLikesLocation(value) {
    if (!isInstagramLocation(value)) return false;
    return new URL(value).pathname.replace(/\/$/, '') === '/your_activity/interactions/likes';
  }
  function normalizePostUrl(value, base) {
    try {
      if (!isInstagramLocation(base)) return null;
      const url = new URL(value, base);
      if (!isInstagramLocation(url.href) || url.origin !== new URL(base).origin ||
          !/^\/(p|reel)\/[A-Za-z0-9_-]{1,80}\/?$/.test(url.pathname)) return null;
      return url.origin + url.pathname.replace(/\/$/, '') + '/';
    } catch { return null; }
  }
  function plainActivation(event) {
    return !event.defaultPrevented && event.button === 0 &&
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }
  function findPostLink(path, doc, base) {
    const main = doc.querySelector('main, [role="main"]');
    if (!main || main.querySelector('input[type="checkbox"], [role="checkbox"]')) return null;
    for (const node of path) {
      if (node?.nodeType !== 1) continue;
      const link = node.closest('a[href]');
      if (link && main.contains(link) && !link.hasAttribute('download')) {
        const url = normalizePostUrl(link.getAttribute('href'), base);
        if (url) return {link, url};
      }
    }
    return null;
  }
  // The current official likes UI exposes labelled thumbnail buttons, not links.
  // Read only rendered DOM attributes; never React state or private API payloads.
  function postCards(doc) {
    const main = doc.querySelector('main, [role="main"]');
    if (!main || main.querySelector('input[type="checkbox"], [role="checkbox"]')) return [];
    return [...main.querySelectorAll('article [role="button"][aria-label], article button[aria-label]')]
      .filter(node => node.querySelector('img') && /(?:作成者:|by @)/.test(node.getAttribute('aria-label')));
  }
  function cardKey(card) {
    const img = card?.querySelector('img');
    try {
      const url = new URL(img.getAttribute('src'));
      const mediaKey = url.searchParams.get('ig_cache_key')?.split('.')[0];
      return mediaKey ? 'media:' + mediaKey : url.pathname;
    } catch { return ''; }
  }
  function cardPostUrl(card, base = card.ownerDocument.location.href) {
    try {
      const url = new URL(card.querySelector('img').getAttribute('src'));
      const encoded = url.searchParams.get('ig_cache_key')?.split('.')[0];
      if (!encoded) return null;
      const decoded = scope.atob(encoded);
      let mediaId;
      const single = /^([1-9]\d{9,18})(?:_\d{1,24})?$/.exec(decoded);
      if (single) mediaId = single[1];
      else if (/^[1-9]\d{29,39}$/.test(decoded)) {
        // Some observed video keys concatenate media and another numeric ID.
        // Use the rendered share date to disambiguate the prefix, rather than
        // treating the whole concatenation as a media ID or guessing a length.
        const dateText = card.getAttribute('aria-label')?.match(/[A-Z][a-z]+ \d{1,2}, \d{4}/)?.[0];
        const sharedAt = Date.parse(dateText);
        if (!Number.isFinite(sharedAt)) return null;
        const candidates = [];
        for (let length = 10; length <= 19; length++) {
          if (decoded.length - length < 10) continue;
          const prefix = decoded.slice(0, length);
          const createdAt = Number(BigInt(prefix) >> 23n) + 1314220021721;
          if (Math.abs(createdAt - sharedAt) < 2 * 86400000) candidates.push(prefix);
        }
        if (candidates.length !== 1) return null;
        mediaId = candidates[0];
      }
      if (!mediaId) return null;
      let id = BigInt(mediaId), shortcode = '';
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      while (id) { shortcode = alphabet[Number(id % 64n)] + shortcode; id /= 64n; }
      return normalizePostUrl('/p/' + shortcode + '/', base);
    } catch { return null; }
  }
  function findPostCard(path, doc) {
    const cards = postCards(doc);
    for (const node of path) {
      if (node?.nodeType !== 1) continue;
      const matches = cards.filter(card => card === node || card.contains(node) || card.parentElement === node);
      if (matches.length === 1 && cardKey(matches[0])) {
        const card = matches[0];
        const url = cardPostUrl(card);
        return {link: card, url, native: {key: cardKey(card), label: card.getAttribute('aria-label')}};
      }
      if (matches.length > 1) break;
    }
    return null;
  }
  function loadedPostLinks(doc, base) {
    const main = doc.querySelector('main, [role="main"]');
    const urls = new Set();
    for (const link of main?.querySelectorAll('a[href]') || []) {
      const url = normalizePostUrl(link.getAttribute('href'), base);
      if (url) urls.add(url);
    }
    return urls.size;
  }
  function snapshotScroll(win, source) {
    const elements = new Set([win.document.documentElement, win.document.body]);
    for (let node = source; node?.nodeType === 1; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) elements.add(node);
    }
    return {
      x: win.scrollX, y: win.scrollY,
      elements: [...elements].filter(Boolean).map(node => ({node, top: node.scrollTop, left: node.scrollLeft}))
    };
  }
  function restoreScroll(win, snapshot) {
    for (const item of snapshot.elements) {
      if (item.node.isConnected) { item.node.scrollTop = item.top; item.node.scrollLeft = item.left; }
    }
    win.scrollTo({left: snapshot.x, top: snapshot.y, behavior: 'instant'});
  }
  function lockScroll(snapshot) {
    const changes = snapshot.elements.map(({node}) => {
      const properties = ['overflow', 'overflow-x', 'overflow-y', 'scrollbar-gutter'];
      const before = properties.map(name => [name, node.style.getPropertyValue(name), node.style.getPropertyPriority(name)]);
      node.style.setProperty('scrollbar-gutter', 'stable', 'important');
      node.style.setProperty('overflow', 'hidden', 'important');
      return {node, before};
    });
    return () => {
      for (const {node, before} of changes) {
        for (const [name] of before) node.style.removeProperty(name);
        for (const [name, value, priority] of before) if (value) node.style.setProperty(name, value, priority);
      }
    };
  }
  function pauseMedia(doc) {
    for (const media of doc?.querySelectorAll('video, audio') || []) {
      try { media.pause(); } catch { /* Frame removal remains the final stop. */ }
    }
  }
  scope.IGLikesCore = Object.freeze({HISTORY_KEY, isInstagramLocation, isLikesLocation,
    normalizePostUrl, plainActivation, findPostLink, loadedPostLinks, snapshotScroll,
    restoreScroll, lockScroll, pauseMedia, postCards, cardKey, findPostCard, cardPostUrl});
})(typeof self === 'undefined' ? globalThis : self);

/* Reversible presentation of the already-rendered official likes grid. */
(function () {
  'use strict';
  self.IGLikesLayout = function (doc, controls) {
    const win = doc.defaultView;
    const marked = new Set();
    const sheet = doc.createElement('style');
    sheet.textContent = `
      [data-iglv-layout="panel"]{width:calc(100% - 88px)!important;max-width:none!important;margin:12px 16px 12px 72px!important;min-width:0!important}
      [data-iglv-layout="sidebar"]{display:none!important}
      [data-iglv-layout="article"]{width:100%!important;max-width:none!important;flex:1 1 0!important;min-width:0!important}
      [data-iglv-layout="scroll-grid"]{display:grid!important;grid-template-columns:repeat(var(--iglv-columns,5),minmax(0,1fr))!important;gap:6px!important;justify-content:start!important;align-content:start!important}
      [data-iglv-layout="row"]{display:contents!important}
      [data-iglv-layout="tile"]{width:100%!important;height:var(--iglv-size)!important;min-height:var(--iglv-size)!important;min-width:0!important;aspect-ratio:1!important;position:relative!important}
      [data-iglv-layout="tile"] img{width:100%!important;height:100%!important;object-fit:cover!important}
      [data-iglv-layout="tile"] [role="button"][aria-label]{width:100%!important;height:100%!important}
      [data-iglv-layout="scroll-grid"] > :not([data-iglv-layout="row"]){grid-column:1 / -1!important}
      [data-iglv-layout="scroll-grid"] plasmo-csui{display:none!important}
    `;
    doc.head.appendChild(sheet);
    let wide = true, target = 280, timer;
    function mark(node, kind) {
      if (!node || node.hasAttribute('data-iglv-layout')) return;
      node.setAttribute('data-iglv-layout', kind); marked.add(node);
    }
    function clear() {
      for (const node of marked) {node.removeAttribute('data-iglv-layout');node.style.removeProperty('--iglv-columns');node.style.removeProperty('--iglv-size');}
      marked.clear();
    }
    function apply() {
      if (!wide) return;
      const cards = self.IGLikesCore.postCards(doc);
      const article = cards[0]?.closest('article');
      if (!article) return;
      mark(article.parentElement, 'panel'); mark(article, 'article');
      for (const sibling of article.parentElement.children) if (sibling.tagName === 'UL') mark(sibling, 'sidebar');
      const grids = new Set();
      for (const card of cards) {
        let tile = card.parentElement;
        while (tile && tile !== article && tile.style.aspectRatio !== '1 / 1') tile = tile.parentElement;
        if (!tile || tile === article) continue;
        const row = tile.parentElement, group = row?.parentElement, grid = group?.parentElement;
        if (!grid || !grid.style.scrollSnapStop || !group.style.marginBottom) continue;
        mark(tile, 'tile');mark(row, 'row');mark(group, 'row');mark(grid, 'row');mark(grid.parentElement, 'scroll-grid');grids.add(grid.parentElement);
      }
      for (const grid of grids) {
        const columns = Math.max(2, Math.min(8, Math.round(grid.clientWidth / target)));
        const value = String(columns);
        if (grid.style.getPropertyValue('--iglv-columns') !== value) grid.style.setProperty('--iglv-columns', value);
        const size = ((grid.clientWidth - 6 * (columns - 1)) / columns) + 'px';
        if (grid.style.getPropertyValue('--iglv-size') !== size) grid.style.setProperty('--iglv-size', size);
        controls.output.textContent = `${columns}列`;
      }
    }
    function schedule() {clearTimeout(timer);timer = setTimeout(apply, 100);}
    const observer = new win.MutationObserver(schedule);
    observer.observe(doc.querySelector('main') || doc.body, {childList:true,subtree:true});
    controls.slider.addEventListener('input', () => {target=Number(controls.slider.value);apply();});
    controls.toggle.addEventListener('click', () => {
      wide=!wide;controls.toggle.textContent=wide?'元の一覧':'一覧を広げる';
      controls.slider.disabled=!wide;clear();if(wide)apply();else controls.output.textContent='標準';
    });
    win.addEventListener('resize',schedule);apply();
    return {destroy(){observer.disconnect();clearTimeout(timer);win.removeEventListener('resize',schedule);clear();sheet.remove();}};
  };
})();

/* Focus the official media subtree without copying its images or players. */
(function () {
  'use strict';
  self.IGLikesPostView = function (doc) {
    const win = doc.defaultView;
    const sheet = doc.createElement('style');
    let root=null, width=0, height=0;
    const marked = new Set();
    doc.head.appendChild(sheet);
    function resetMarks() {for(const e of marked)e.removeAttribute('data-iglv-post');marked.clear();}
    function mark(e,value){e.setAttribute('data-iglv-post',value);marked.add(e);}
    function discover() {
      const main=doc.querySelector('main');if(!main)return;
      const media=[...main.querySelectorAll('video,img')].find(e=>e.getBoundingClientRect().width>180&&e.getBoundingClientRect().height>180);
      if(!media)return;
      const box=media.getBoundingClientRect();
      let candidate=media;
      for(let e=media.parentElement;e&&e!==main;e=e.parentElement){
        const b=e.getBoundingClientRect();
        // Carousel slides may sit inside a wide translated strip before
        // the visible frame. Keep searching for the matching outer frame.
        if(Math.abs(b.width-box.width)<=3&&Math.abs(b.height-box.height)<=3)candidate=e;
      }
      root=candidate;width=box.width;height=box.height;
      resetMarks();mark(root,'media');for(let e=root.parentElement;e&&e!==doc.body;e=e.parentElement)mark(e,'ancestor');
      apply();
    }
    function apply() {
      if(!root){sheet.textContent='';return;}
      const scale=Math.min((win.innerWidth-24)/width,(win.innerHeight-24)/height);
      sheet.textContent=`
        body{background:#080b0a!important;overflow:hidden!important}
        body *{visibility:hidden!important}
        [data-iglv-post="ancestor"]{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;overflow:visible!important}
        [data-iglv-post="media"]{position:fixed!important;left:50%!important;top:50%!important;width:${width}px!important;height:${height}px!important;min-width:0!important;max-width:none!important;min-height:0!important;max-height:none!important;margin:0!important;flex:none!important;z-index:2147483644!important;transform:translate(-50%,-50%) scale(${scale})!important;transform-origin:center!important}
        [data-iglv-post="media"],[data-iglv-post="media"] *,button[aria-label="投稿を閉じて元のいいね一覧に戻る"]{visibility:visible!important}
      `;
    }
    function refresh(){if(!root?.isConnected){sheet.textContent='';discover();}}
    win.addEventListener('resize',apply);refresh();
    return {refresh,destroy(){win.removeEventListener('resize',apply);sheet.remove();resetMarks();}};
  };
})();
