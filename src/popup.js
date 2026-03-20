const STORAGE_KEY = "shortsDisabled";
const MESSAGE_TYPE = "SHORTS_TOGGLE_UPDATED";

const checkbox = document.getElementById("shorts-toggle");
const status = document.getElementById("status");

function updateStatus(isDisabled) {
  status.textContent = isDisabled
    ? "Shorts are currently blocked."
    : "Shorts are currently allowed.";
}

function notifyOpenYouTubeTabs(isDisabled) {
  chrome.tabs.query({ url: ["*://*.youtube.com/*"] }, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id) return;
      chrome.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPE,
        value: isDisabled
      });
    });
  });
}

chrome.storage.sync.get({ [STORAGE_KEY]: false }, (result) => {
  const isDisabled = Boolean(result[STORAGE_KEY]);
  checkbox.checked = isDisabled;
  updateStatus(isDisabled);
});

checkbox.addEventListener("change", () => {
  const isDisabled = checkbox.checked;
  chrome.storage.sync.set({ [STORAGE_KEY]: isDisabled }, () => {
    updateStatus(isDisabled);
    notifyOpenYouTubeTabs(isDisabled);
  });
});
