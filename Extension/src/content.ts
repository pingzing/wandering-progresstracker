import browser from 'webextension-polyfill';
import { type BrowserMessage, type BrowserMessageType, type ColorScheme } from './models';
import tocService from './tocService';
import userDataService from './userDataService';

// Entry point
(async () => {

  // TODO: Check lastTocUpdate, and only update if it's... say a day old

  const tocUrl = "https://wanderinginn.com/table-of-contents";
  let onToc: boolean = false;
  let tocContents: Document | null = null;

  // don't use .startsWith() for checking the tocUrl, because the user might have ebook or sorting turned on,
  // which will blow up our tocService. It assumes things are in chronological order.
  if (window.location.href === tocUrl) {
    console.log(`We're on the ToC! No need to make the background request`);
    onToc = true;
    tocContents = document;
  }


  if (!onToc) {
    console.log('sending requestToc message');
    const tocHtml: string | null = await browser.runtime.sendMessage(<BrowserMessage>{
      type: 'requestToc'
    });
    // TODO: If this fails, fall back to cached version
    // If no cache exists, log an error, and end
    if (!tocHtml) {
      console.log("Unable to retrieve toc")
      return;
    }
    const domParser = new DOMParser();
    tocContents = domParser.parseFromString(tocHtml, 'text/html');
    console.log("Toc message complete!");
  }

  if (!tocContents) {
    console.log(`Failed to get ToC! Bailing...`);
    return;
  }

  const latestChapters = tocService.getChaptersFromToc(tocContents);
  if (!latestChapters) {
    console.log(`Failed to parse chapter list from ToC.`);
    return;
  }

  userDataService.addNewChapters(latestChapters);

  const allKnownChapters = await userDataService.getUserData();

  if (allKnownChapters.savedChapters.has(window.location.href)) {
    const chapterInfo = allKnownChapters.savedChapters.get(window.location.href);
      console.log(`Hey, I know this chapter! It's ${chapterInfo?.chapterName}, with index ${chapterInfo?.chapterIndex}!`);
  }


  // TODO: If success, update cached list of chapter names and chapter URLs
  // Then set up callbacks to listen for us landing on any of those chapter pages
  // If we land on any of those pages, fire up the onscroll tracker and the HTML replacement

  // TODO: HTML replacement should include
  // - Content scrollbar at the top of the screen
  // - Bookmark red line thingy
  // - onclick handler for all <p> elements
  // - floating box for <p> handler that allows bookmarking
  // - onscroll handler that tracks further-scrolled position on page 
  //    (with throttle so a brief jaunt to the bottom doesn't count)
  //    (with range, so scrolling *beyond* the end of the actual content won't count as finishing)

  // TODO: Bonus points: implement completion bars on the ToC so people can see how far along they are per-chapter.
  // Progress bar implementation:
  // - get the 'body-web table-cell' div under each 'chapter-entry' div
  // - change each background to: 
  //    linear-gradient(to right, green <percent-complete>%, transparent <percent complete>%, transparent)
  // - to include a percentage completion indicator:
  //   - each chapter-entry container gains position: relative
  //   - we create a new div child below each with the percentage completed, and the following style:
  //   - display: inline-block; position: absolute; top: 25%; right: 1%;

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
