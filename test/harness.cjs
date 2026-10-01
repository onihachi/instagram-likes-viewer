const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const sources = Object.fromEntries(['core.js', 'content.js', 'background.js'].map(name =>
  [name, fs.readFileSync(path.join(__dirname, '..', 'extension', name), 'utf8')]));
const likes = 'https://www.instagram.com/your_activity/interactions/likes/';
const activeHarnesses = new Set();
require('node:test').afterEach(() => { for (const item of [...activeHarnesses]) item.close(); });
function harness(url = likes, html = '') {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(`<!doctype html><html><body><main><div class="scroller">${html || '<a id="one" href="/p/POST_1/"><img alt="投稿1"></a><a id="two" href="/reel/POST_2/"><img alt="投稿2"></a>'}</div></main></body></html>`, {
    url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
    // resources deliberately omitted: this harness never requests Instagram.
  });
  const win = dom.window;
  const childDoms = [];
  const createElement = win.document.createElement.bind(win.document);
  win.document.createElement = function (name, options) {
    const element = createElement(name, options);
    if (name === 'iframe') {
      // jsdom does not create browsing contexts for frames inside Shadow DOM.
      // Supply an explicitly simulated child DOM, without any network request.
      let child;
      const getChild = () => {
        if (!child) {
          child = new JSDOM('<!doctype html><html><body></body></html>', {url:element.src || 'about:blank',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
          childDoms.push(child);
        }
        return child;
      };
      Object.defineProperty(element,'contentDocument',{configurable:true,get:()=>getChild().window.document});
      Object.defineProperty(element,'contentWindow',{configurable:true,get:()=>getChild().window});
    }
    return element;
  };
  let shadow = null;
  const attach = win.HTMLElement.prototype.attachShadow;
  win.HTMLElement.prototype.attachShadow = function (options) {
    const root = attach.call(this, options);
    if (this.localName === 'ig-likes-viewer') shadow = root;
    return root;
  };
  // jsdom has no layout, native dialog modality, or media playback.
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  win.scrollTo = ({left, top}) => { win.scrollX = left; win.scrollY = top; };
  const messages = [];
  win.chrome = {runtime: {sendMessage: async message => { messages.push(message); return {ok: true}; }}};
  win.eval(sources['core.js']);
  function activate() { return win.eval(sources['content.js']); }
  function click(node, options = {}) {
    const event = new win.MouseEvent('click', {bubbles: true, composed: true, cancelable: true, button: 0, ...options});
    node.dispatchEvent(event);
    return event;
  }
  function frameReady(html = '<article><p>通常の投稿本文</p><video></video><button>再生</button></article>') {
    const frame = shadow.querySelector('iframe');
    const doc = frame.contentDocument;
    doc.open(); doc.write(html); doc.close();
    let pauses = 0;
    for (const media of doc.querySelectorAll('video,audio')) media.pause = () => { pauses++; };
    frame.dispatchEvent(new win.Event('load'));
    return {frame, doc, get pauses() { return pauses; }};
  }
  const result = {dom, win, doc: win.document, get shadow() {return shadow;}, activate, click, frameReady, messages,
    close() { win.__IGLV_APP__?.destroy(false); for(const child of childDoms) child.window.close(); win.close(); activeHarnesses.delete(result); }};
  activeHarnesses.add(result);
  return result;
}
const wait = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms));
module.exports = {harness, sources, likes, wait};
