'use strict';
importScripts('core.js');

async function feedback(tabId, text, title) {
  await chrome.action.setBadgeText({tabId, text});
  await chrome.action.setBadgeBackgroundColor({tabId, color: text === '!' ? '#a33b35' : '#315c50'});
  await chrome.action.setTitle({tabId, title});
}
chrome.action.onClicked.addListener(async tab => {
  if (!Number.isInteger(tab.id)) return;
  if (!IGLikesCore.isLikesLocation(tab.url)) {
    await feedback(tab.id, '!', '公式いいね一覧を開いてから起動してください');
    return;
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id}, files: ['core.js', 'content.js'], world: 'ISOLATED'
    });
    const enabled = results[0]?.result?.enabled;
    await feedback(tab.id, enabled ? 'ON' : '', enabled ?
      'いいねビュー起動中 — 押すと停止' : 'Instagramの公式いいね一覧で起動／停止');
  } catch {
    await feedback(tab.id, '!', '起動できませんでした。一覧を再読み込みして拡張ボタンを押してください');
  }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'IGLV_STOPPED' && sender.frameId === 0 && IGLikesCore.isInstagramLocation(sender.tab?.url)) {
    feedback(sender.tab.id, '', 'Instagramの公式いいね一覧で起動／停止').then(() => respond({ok: true}), () => respond({ok: false}));
    return true;
  }
  if (message?.type !== 'IGLV_OPEN_POST') return false;
  const url = IGLikesCore.normalizePostUrl(message.url, sender.tab?.url);
  if (sender.frameId !== 0 || !IGLikesCore.isLikesLocation(sender.tab?.url) || !url) {
    respond({ok: false});
    return false;
  }
  chrome.tabs.create({url, active: true}).then(() => respond({ok: true}), () => respond({ok: false}));
  return true;
});
