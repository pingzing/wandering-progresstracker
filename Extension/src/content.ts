import browser from 'webextension-polyfill';
import { type BrowserMessage, type BrowserMessageType, type ColorScheme, type StoryUrl, type UserChapterInfo } from './models';
import * as tocService from './tocService';
import userDataService from './userDataService';
import * as serialization from './serialization';
import { mapToString } from './serialization';
import { debounce } from './timing';
import { ChapterContent } from './chapterContent';

setupMessageHandlers();
if (document.readyState === 'complete') {
  onLoaded();
} else {
  addEventListener('DOMContentLoaded', onLoaded);
}

async function onLoaded(): Promise<void> {
  const tocUrl = "https://wanderinginn.com/table-of-contents/";
  let onToc: boolean = false;
  let chapterContent: ChapterContent;  

  // TODO: Test stuff
  // Since we can't use popups on mobile, we'll have to inject some UI
  // that allows users to select sharing options onto the page itself
  // this is a very dirty PoC that does that

  // Button styling notes:
  // position: sticky
  // bottom: 0
  // Insert it just after <aticle>, BUT!!!
  // <main> has an `overflow: hidden` that appears to serve no purpose
  // that prevents the sticky-ing. That needs to be turned off for this to work.
  const article = document.getElementById('post-16343');
  const tempButton = document.createElement('button');
  tempButton.type = 'button';
  tempButton.textContent = "Serialize Chapter to URL";
  tempButton.onclick = (ev) => {
    browser.runtime.sendMessage(<BrowserMessage>{
      type: 'getChapters',
    }).then((chapterString: string) => {
      serializeChapterToUrl(chapterString);
    });
  };
  article?.prepend(tempButton);
  // 

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

  // TODO: Check for the `wpt` and `wptc` query params: if they exist, parse them,
  // update local state accordingly, and then strip them from the URL via replaceState.

  const chapters = serialization.stringToMap<StoryUrl, UserChapterInfo>(
    await browser.runtime.sendMessage(<BrowserMessage>{
      type: 'getChapters',
    }));

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
        // get chapters as big string, stuff in URL bar as query param
        browser.runtime.sendMessage(<BrowserMessage>{
          type: 'getChapters',
        }).then((chapterString: string) => {
          serializeAllToUrl(chapterString);
        });
        break;
      }
      case 'serializeChapterToUrl': {
        browser.runtime.sendMessage(<BrowserMessage>{
          type: 'getChapters',
        }).then((chapterString: string) => {
          serializeChapterToUrl(chapterString);
        });
        break;
      }
    }
  });
}

function serializeAllToUrl(mapString: string): void {
  const map = serialization.stringToMap<StoryUrl, UserChapterInfo>(mapString);
  const completions: number[] = [];
  for (const entry of map) {
    completions.push(entry[1].paragraphIndex ?? 0);
  }
  const completionString = completions.join(`.`);
  const chapterUrl = window.location.origin + window.location.pathname;
  const url = new URL(chapterUrl);
  url.searchParams.append("wpt", completionString);
  history.pushState("", "", url);
}

function serializeChapterToUrl(mapString: string): void {
  const map = serialization.stringToMap<StoryUrl, UserChapterInfo>(mapString);
  const chapterUrl = window.location.origin + window.location.pathname;
  const chapterData = map.get(chapterUrl);
  if (!chapterData) {
    console.log(`No chapter data found for ${chapterUrl}. Can't serialize.`);
    return;
  }
  const dataString = JSON.stringify(chapterData);
  const url = new URL(chapterUrl);
  url.searchParams.append(`wptc`, dataString);
  history.pushState(``, ``, url);
}

function getColorScheme() {
  let scheme: ColorScheme = 'light';
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkModeMediaQuery.matches) {
    scheme = 'dark';
  }
  return scheme;
}

