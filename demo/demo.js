/* Local-only adapter. This file is excluded from the installable extension. */
'use strict';
const officialCore = self.IGLikesCore;
function localPostUrl(value, base) {
  try {const url=new URL(value,base);return url.origin===location.origin && /^\/(p|reel)\/[A-Za-z0-9_-]+\/$/.test(url.pathname) ? url.origin+url.pathname : null;}catch{return null;}
}
self.IGLikesCore=Object.freeze({...officialCore,
  isLikesLocation:url=>new URL(url).origin===location.origin && new URL(url).pathname==='/your_activity/interactions/likes/',
  normalizePostUrl:localPostUrl,
  findPostLink(path,doc,base){for(const node of path){const link=node?.closest?.('main a[href]');const url=link&&localPostUrl(link.href,base);if(url)return{link,url};}return null;},
  loadedPostLinks(doc,base){return new Set([...doc.querySelectorAll('main a[href]')].map(link=>localPostUrl(link.href,base)).filter(Boolean)).size;}
});
const toggle=document.querySelector('#toggle');
self.chrome={runtime:{sendMessage:async message=>{
  if(message.type==='IGLV_OPEN_POST'){const url=localPostUrl(message.url,location.href);if(!url)return{ok:false};const opened=window.open(url,'_blank');if(opened)opened.opener=null;return{ok:!!opened};}
  if(message.type==='IGLV_STOPPED')toggle.textContent='ビューアを起動';
  return{ok:true};
}}};
toggle.addEventListener('click',()=>{
  const script=document.createElement('script');script.src='/extension/content.js';
  script.onload=()=>{toggle.textContent=self.__IGLV_APP__?'ビューアを停止':'ビューアを起動';script.remove();};document.head.append(script);
});
let count=0;
function appendPosts(n){for(let i=0;i<n;i++){
  count++;const index=count;const link=document.createElement('a');
  link.href=index===28?'/p/DELETED/':`/${index%5===0?'reel':'p'}/POST_${index}/`;
  const image=document.createElement('img');image.src=`/art/${index}.svg`;image.alt=`架空の投稿 ${index}`;image.loading='lazy';
  const label=document.createElement('div');label.className='card-text';
  const title=document.createElement('span');title.textContent=`日々の記録 ${String(index).padStart(2,'0')}`;
  const type=document.createElement('span');type.textContent=index===28?'エラー例':index%5===0?'動画の例':'写真';
  label.append(title,type);link.append(image,label);document.querySelector('#grid').append(link);
}}
document.querySelector('#load').addEventListener('click',()=>appendPosts(24));appendPosts(36);
