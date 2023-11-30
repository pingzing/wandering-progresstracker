import browser from 'webextension-polyfill';
import { type BrowserMessage, type BrowserMessageType, type ColorScheme, type StoryUrl, type UserChapterInfo } from './models';
import * as tocService from './tocService';
import userDataService from './userDataService';
import * as serialization from './serialization';
import { mapToString } from './serialization';

let bookmarkDiv: HTMLDivElement;

// Entry point
(async () => {

  const tocUrl = "https://wanderinginn.com/table-of-contents/";
  let onToc: boolean = false;

  // don't use .startsWith() for checking the tocUrl, because the user might have ebook or sorting turned on,
  // which will blow up our tocService. It assumes things are in chronological order.
  if (window.location.href === tocUrl) {
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
  if (chapters.has(window.location.href)) {
    // TODO: Wrap thiis in DOM.onloaded so we know everything is good to go
    const currentChapter: UserChapterInfo = chapters.get(window.location.href)!;

    // We need this, because it's the closest 'position: relative' ancestor, so that's what
    // the bookmark winds up being parented to.
    const articleTagResults = document.getElementsByTagName("article");
    if (articleTagResults.length === 0) {
      console.log(`Unable to find the article tag. Bailing...`);
      return;
    }
    const articleTag = articleTagResults[0];

    // Chapter content is inside `entry-content` classed div
    const contentDivResult = document.getElementsByClassName('entry-content');
    if (contentDivResult.length === 0) {
      console.log(`Unable to find 'entry-content' div. Bailing...`);
      return;
    }

    const contentDiv = contentDivResult[0];
    const contentParagraphsResult = contentDiv.getElementsByTagName('p');
    if (contentParagraphsResult.length === 0) {
      console.log(`Unable to find any paragraphs in content. Bailing...`)
      return;
    }

    // ---Initial bookmark setup---

    // offsetParent filter removes any hidden paragraphs
    const contentParagraphs = Array.from(contentParagraphsResult).filter(x => x.offsetParent !== null);

    const firstParagraph = contentParagraphs[0];
    const lastParagraph = contentParagraphs[contentParagraphs.length - 1];

    bookmarkDiv = document.createElement("div");
    bookmarkDiv.className = "bookmark";
    contentDiv.prepend(bookmarkDiv);

    const firstParagraphTop = getAbsoluteY(firstParagraph);
    const articleTop = getAbsoluteY(articleTag);
    bookmarkDiv.style.top = `${Math.floor(firstParagraphTop - articleTop)}px`;
    // ---

    let bookmarkY = 0; // Relative to the <article> tag, *not* the first paragraph.
    if (currentChapter.paragraphIndex) {
      const paragraph = contentParagraphs[currentChapter.paragraphIndex];
      const paragraphTop = getAbsoluteY(paragraph);
      bookmarkDiv.style.top = `${Math.floor(paragraphTop - articleTop)}px`;
      bookmarkY = Math.floor(paragraphTop - articleTop);
      paragraph.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }

    // ---OnScroll stuff---
    let previousY = 0;
    const handleScroll = debounce(1000, (scrollEvent: any) => {
      const newY = window.scrollY;
      if (newY < previousY) {
        previousY = newY;
        return;
      };
      previousY = newY;

      // ignore any scrolling that doesn't land us inside the actual chapter text
      if (newY < getAbsoluteY(firstParagraph, newY) || newY > getAbsoluteY(lastParagraph, newY)) {
        return;
      }

      // Only move the bookmark if it's new position would be further down than its old one.
      if (bookmarkY + getAbsoluteY(articleTag, newY) <= newY) {
        // find the closest paragraph that's beeen scrolled up off the screen, set our bookmark there
        const nearestAboveParagraph = paragraphBinarySearch(contentParagraphs, newY);
        const nearestParagraphTop = getAbsoluteY(nearestAboveParagraph, newY);
        const articleTop = getAbsoluteY(articleTag, newY);
        bookmarkY = Math.floor(nearestParagraphTop - articleTop);
        bookmarkDiv.style.top = `${bookmarkY}px`;

        // Chapter completion
        const lastParagraphTop = getAbsoluteY(lastParagraph, newY);
        const percentCompletion = nearestParagraphTop / lastParagraphTop;

        currentChapter.paragraphIndex = contentParagraphs.indexOf(nearestAboveParagraph);
        currentChapter.percentCompletion = percentCompletion;

        const updateChapterPayload = mapToString(new Map<StoryUrl, UserChapterInfo>([[window.location.href, currentChapter]]));
        browser.runtime.sendMessage(<BrowserMessage>{
          type: 'updateChapters',
          value: updateChapterPayload
        });
      }
    });
    addEventListener('scroll', handleScroll);
    // ---

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

function paragraphBinarySearch(array: HTMLParagraphElement[], startingYCoord: number): HTMLParagraphElement {
  let front = 0;
  let back = array.length - 1;

  while (front < back) {
    let mid = (front + back) >> 1;
    const comparisonElement = array[mid];
    const comparisonTop = getAbsoluteY(comparisonElement, startingYCoord);

    if (comparisonTop === startingYCoord) {
      return array[mid];
    }

    // Binary searching
    if (comparisonTop < startingYCoord + 1) {
      front = mid + 1;
    } else {
      back = mid;
    }
  }

  return array[front - 1];
}

/**
 * Get the y-coordinate (technically, `top`) of the given element via getBoundingClientRect, 
 * relative to the top of the document, or the given y-offset.
 * @param elem The element to get the y-coordinate of.
 * @param ySource The amount to offset the element's coordinate by. If unset, uses `window.scrollY`.
 * Should probably usually be some source of that, regardless.
 */
function getAbsoluteY(elem: Element, ySource?: number): number {
  const yOffset: number = ySource ? ySource : window.scrollY;
  return elem.getBoundingClientRect().top + yOffset;
}

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

function debounce<T extends (...args: any[]) => void>(wait: number, callback: T) {
  let timeout: ReturnType<typeof setTimeout> | null;
  return function <U>(this: U, ...args: Parameters<typeof callback>) {
    const context = this;
    const later = () => {
      timeout = null;
      callback.apply(context, args);
    };

    if (typeof timeout === "number") {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);
  }
}

