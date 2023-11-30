import browser from 'webextension-polyfill';
import { type BrowserMessage, type BrowserMessageType, type ColorScheme } from './models';
import * as tocService from './tocService';
import userDataService from './userDataService';
import chapterService from './chapterService';

// Entry point
(async () => {

  const tocUrl = "https://wanderinginn.com/table-of-contents";
  let onToc: boolean = false;

  // don't use .startsWith() for checking the tocUrl, because the user might have ebook or sorting turned on,
  // which will blow up our tocService. It assumes things are in chronological order.
  if (window.location.href === tocUrl) {
    onToc = true;
    const tocContents = document;
    const chapters = tocService.getChaptersFromToc(tocContents);
    if (chapters) {
      chapterService.addNewChapters(chapters);
    }
  }

  const chapters = await chapterService.getChapters();

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
    return;
  }

  if (chapters.has(window.location.href)) {
    const chapterInfo = chapters.get(window.location.href);
    console.log(`Hey, I know this chapter! It's ${chapterInfo?.chapterName}, with index ${chapterInfo?.chapterIndex}!`);

    // TODO: HTML replacement should include
    // - Content scrollbar at the top of the screen
    // - Bookmark red line thingy
    // - onclick handler for all <p> elements
    // - floating box for <p> handler that allows bookmarking
    // - onscroll handler that tracks further-scrolled position on page 
    //    (with throttle so a brief jaunt to the bottom doesn't count)
    //    (with range, so scrolling *beyond* the end of the actual content won't count as finishing)
    return;
  }
})();

browser.runtime.onMessage.addListener(message => {
  console.log('got message', message);
  switch (message.type as BrowserMessageType) {
    case 'getColorScheme': {
      return Promise.resolve(getColorScheme());
    }
  }
});

function getColorScheme() {
  let scheme: ColorScheme = 'light';
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkModeMediaQuery.matches) {
    scheme = 'dark';
  }
  return scheme;
}
