import { runtime, tabs, type Runtime } from 'webextension-polyfill';
import { detect } from 'detect-browser';
import {
  type BrowserMessage,
  type BrowserMessageType,
  type ChapterInfo,
  type ColorScheme,
  type StoryUrl,
  type UserChapterInfo
} from './shared/models';
import settingsService from './background/settingsService';
import chapterService from './background/chapterService';
import { mapToString, stringToMap } from './shared/serialization';

runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    tabs.create({
      url: '../public/settings.html'
    });
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
  console.log('got message', message);
  switch (message.type as BrowserMessageType) {
    case 'gotColorScheme': {
      updateIcon(message.value as ColorScheme).then(sendResponse);
      return true;
    }
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

async function updateIcon(colorScheme: ColorScheme) {
  console.log('updating icon', colorScheme);
  // do work here
}
