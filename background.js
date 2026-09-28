// HANU TKB Preview - Background
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
});

// Event checking
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'UPDATE_BADGE') {
    const text = msg.count > 0 ? String(msg.count) : '';
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#07689F', tabId: sender.tab.id });
  }
});
