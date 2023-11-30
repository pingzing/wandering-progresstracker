import { runtime, tabs, type Runtime } from 'webextension-polyfill';
import { detect } from 'detect-browser';
import {
  type BrowserMessage,
  type BrowserMessageType,
  type ChapterInfo,
  type ColorScheme,
  type StoryUrl,
  type UserChapterInfo
} from './models';
import settingsService from './settingsService';
import chapterService from './chapterService';
import { mapToString, stringToMap } from './serialization';

runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    tabs.create({
      url: '../public/onboarding.html'
    })
  } else { // browser_update or update
    // TODO: Probably nothing.
  }
})

runtime.onMessage.addListener(onMessage);

function onMessage(message: any, sender: Runtime.MessageSender, sendResponse: (x?: any) => void): true | void | Promise<any> {
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
      const newChapters = stringToMap<StoryUrl, ChapterInfo>(message);
      addChapters(newChapters);
      return;
    }
    case 'updateChapters': {
      const addedChapters = stringToMap<StoryUrl, UserChapterInfo>(message);
      updateChapters(addedChapters).then(sendResponse);
      return true;
    }
  }
}

function getChapters(): Promise<Map<StoryUrl, UserChapterInfo>> {
  return chapterService.getChapters();
}

function addChapters(parsedChapters: Map<StoryUrl, ChapterInfo>): void {
  return chapterService.addNewChapters(parsedChapters);
}

function updateChapters(updatedChapters: Map<StoryUrl, UserChapterInfo>): Promise<void> {
  return chapterService.updateChapters(updatedChapters);
}


async function updateIcon(colorScheme: ColorScheme) {
  console.log('updating icon', colorScheme);
  // do work here
}