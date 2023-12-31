import { runtime, tabs, type Runtime } from 'webextension-polyfill';

import {
  type BrowserMessageType,
  type ChapterInfo,
  type StoryUrl,
  type UserChapterInfo
} from './shared/models';
import chapterService from './background/chapterService';
import { mapToString, stringToMap } from './shared/serialization';
import { wptLog } from './shared/logging';

export const ConfigTabSettingsKey = `configTab`;

runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    const settingsTab = await tabs.create({
      active: true,
      url: '../public/settings.html',
    });
    // TODO: Make this Chrome-friendly
    await browser.storage.session.set({ [ConfigTabSettingsKey]: settingsTab.id });
  } else {
    // browser_update or update
    // TODO: Probably nothing.
  }
});

runtime.onMessage.addListener(onMessage);

function onMessage(
  message: any,
  sender: Runtime.MessageSender,
  sendResponse: (x?: any) => void
): true | void | Promise<any> {
  wptLog('got message', message);
  switch (message.type as BrowserMessageType) {
    case 'getChapters': {
      getChapters().then(chapters => sendResponse(mapToString(chapters)));
      return true;
    }
    case 'addNewChapters': {
      const newChapters = stringToMap<StoryUrl, ChapterInfo>(message.value);
      addChapters(newChapters).then(sendResponse);
      return true;
    }
    case 'updateChapters': {
      const addedChapters = stringToMap<StoryUrl, UserChapterInfo>(message.value);
      updateChapters(addedChapters).then(updatedMap => {
        if (updatedMap) {
          sendResponse(mapToString(updatedMap));
        }
      });
      return true;
    }
  }
}

function getChapters(): Promise<Map<StoryUrl, UserChapterInfo>> {
  return chapterService.getChapters();
}

function addChapters(parsedChapters: Map<StoryUrl, ChapterInfo>): Promise<void> {
  return chapterService.addNewChapters(parsedChapters);
}

function updateChapters(
  updatedChapters: Map<StoryUrl, UserChapterInfo>
): Promise<Map<StoryUrl, ChapterInfo> | null> {
  return chapterService.updateChapters(updatedChapters);
}
