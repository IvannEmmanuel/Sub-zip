import type { ActionResult } from '../lib/messaging';
import { sendToTab } from '../lib/messaging';

function flashBadge(tabId: number, text: string): void {
  void chrome.action.setBadgeBackgroundColor({ color: '#F97316', tabId });
  void chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: '', tabId }), 3500);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-pip') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;

  const result = await sendToTab<ActionResult>(tab.id, { type: 'toggle-pip' });
  // "!" = no video found, or Chrome refused to open the window without a user gesture on the page.
  if (!result || !result.ok) flashBadge(tab.id, '!');
});
