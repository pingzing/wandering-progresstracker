import browser from 'webextension-polyfill';
import { type BrowserMessage, type BrowserMessageType, type ColorScheme, type StoryUrl, type UserChapterInfo } from './models';
import * as tocService from './tocService'
import * as serialization from './serialization';
import { serializeAllToUrl, serializeChapterToUrl } from './serialization';
import { ChapterContent } from './chapterContent';

setupMessageHandlers();
if (document.readyState === 'loading') {
  addEventListener('DOMContentLoaded', onLoaded);
} else {
  onLoaded();
}

async function onLoaded(): Promise<void> {
  const tocUrl = "https://wanderinginn.com/table-of-contents/";
  let onToc: boolean = false;
  let chapterContent: ChapterContent; // holding onto this so it doesn't get GC'ed. Might not matter?

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
      })
    }
  }

  let chapters = serialization.stringToMap<StoryUrl, UserChapterInfo>(
    await browser.runtime.sendMessage(<BrowserMessage>{
      type: 'getChapters',
    }));

  const currentUrl = new URL(window.location.href);

  // TODO: Move these checks out into functions or their own class.
  const paragraphIndices = serialization.deserializeAllFromUrl(currentUrl);
  if (paragraphIndices) {
    // probably over-cautious, because we generally create the Map in chapter order, but JUST IN CASE
    // sort it to ensure it matches the order of the received paragraph indices
    const sortedChapters = Array.from(chapters).sort((a, b) => a[1].chapterIndex - b[1].chapterIndex);
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
      console.log(`Unable to parse UserChapterInfo object from 'wptc' query param. Skipping...`);
    }
  }

  if (onToc) {
    // TODO: Bonus points: implement completion bars on the ToC so people can see how far along they are per-chapter.
    // Progress bar implementation:
    // - get the 'body-web table-cell' div under each 'chapter-entry' div
    // - change each background to: 
    //    linear-gradient(to right, green <percent-complete>%, transparent <percent complete>%, transparent)
    // - to include a percentage completion indicator:
    //   - each chapter-entry container gains position: relative
    //   - we create a new div child below each with the percentage completed, and the following style:
    //   - display: inline-block; position: absolute; top: 25%; right: 1%;
    console.log(`You're on the ToC!`);
    return;
  }

  // Chapter injection
  if (chapters.has(urlNoParams)) {
    chapterContent = new ChapterContent(chapters, urlNoParams);
    return;
  }
}

function setupMessageHandlers(): void {
  browser.runtime.onMessage.addListener(message => {
    console.log('got message', message);
    switch (message.type as BrowserMessageType) {
      case 'getColorScheme': {
        return Promise.resolve(getColorScheme());
      }
      case 'serializeAllToUrl': {
        browser.runtime.sendMessage(<BrowserMessage>{
          type: 'getChapters',
        }).then((chapterString: string) => {
          const url = serializeAllToUrl(chapterString);
          history.pushState("", "", url); // TODO: replaceState instead?
        });
        break;
      }
      case 'serializeChapterToUrl': {
        browser.runtime.sendMessage(<BrowserMessage>{
          type: 'getChapters',
        }).then((chapterString: string) => {
          const chapterUrl = window.location.origin + window.location.pathname;
          const url = serializeChapterToUrl(chapterString, chapterUrl);
          history.pushState("", "", url); // TODO: replaceState instead?
        });
        break;
      }
    }
  });
}



function getColorScheme() {
  let scheme: ColorScheme = 'light';
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkModeMediaQuery.matches) {
    scheme = 'dark';
  }
  return scheme;
}

