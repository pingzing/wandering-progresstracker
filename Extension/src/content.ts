import browser from 'webextension-polyfill';

import {
  type BrowserMessage,
  type StoryUrl,
  type UserChapterInfo
} from './shared/models';
import * as tocService from './shared/tocService';
import * as serialization from './shared/serialization';
import { ChapterContent } from './content/chapterContent';
import { TocContent } from './content/tocContent';
import { wptLog } from './shared/logging';

if (document.readyState === 'loading') {
  addEventListener('DOMContentLoaded', onLoaded);
} else {
  onLoaded();
}

async function onLoaded(): Promise<void> {
  const tocUrl = 'https://wanderinginn.com/table-of-contents/';
  let onToc: boolean = false;
  let chapterContent: ChapterContent; // holding onto this so it doesn't get GC'ed. Might not matter?
  let tocContent: TocContent;

  // strip extra query params off URL, because we'll be using those to send around data.
  const urlNoParams = window.location.origin + window.location.pathname;

  if (urlNoParams === tocUrl) {
    onToc = true;
    const tocContents = document;
    const chapters = tocService.getChaptersFromToc(tocContents);
    if (chapters) {
      await browser.runtime.sendMessage(<BrowserMessage>{
        type: 'addNewChapters',
        value: serialization.mapToString(chapters)
      });
    }
  }

  let chapters = serialization.stringToMap<StoryUrl, UserChapterInfo>(
    await browser.runtime.sendMessage(<BrowserMessage>{
      type: 'getChapters'
    })
  );

  const currentUrl = new URL(window.location.href);

  // TODO: Move these checks out into functions or their own class.
  const paragraphIndices = serialization.deserializeAllFromUrl(currentUrl);
  if (paragraphIndices) {
    // probably over-cautious, because we generally create the Map in chapter order, but JUST IN CASE
    // sort it to ensure it matches the order of the received paragraph indices
    const sortedChapters = Array.from(chapters).sort(
      (a, b) => a[1].chapterIndex - b[1].chapterIndex
    );
    for (let i = 0; i < paragraphIndices.length; i++) {
      const paragraphIndex = paragraphIndices[i];
      const chapter = sortedChapters[i];
      chapter[1].paragraphIndex = paragraphIndex;
    }
    const updatedMap = new Map(sortedChapters);

    const response = await browser.runtime.sendMessage(<BrowserMessage>{
      type: 'updateChapters',
      value: serialization.mapToString(updatedMap)
    });
    if (response) {
      chapters = serialization.stringToMap(response);
    }
  }

  const queryChapterInfo = serialization.deserializeChapterFromUrl(currentUrl);
  if (queryChapterInfo) {
    try {
      const updatedSingleChapterMap = new Map();
      updatedSingleChapterMap.set(urlNoParams, queryChapterInfo);
      const response = await browser.runtime.sendMessage(<BrowserMessage>{
        type: 'updateChapters',
        value: serialization.mapToString(updatedSingleChapterMap)
      });
      if (response) {
        chapters = serialization.stringToMap(response);
      }
    } catch (e) {
      wptLog(`Unable to parse UserChapterInfo object from 'wptc' query param. Skipping...`);
    }
  }

  // ToC injection
  if (onToc) {
    tocContent = new TocContent(chapters);
    wptLog(`You're on the ToC!`);
    return;
  }

  // Chapter injection
  if (chapters.has(urlNoParams)) {
    chapterContent = new ChapterContent(chapters, urlNoParams);
    return;
  }
}