import browser from 'webextension-polyfill';
import type { BrowserMessage, StoryUrl, UserChapterInfo } from '../shared/models';
import { mapToString, serializeAllToUrl, serializeChapterToUrl } from '../shared/serialization';
import { debounce } from '../shared/timing';
import { wptLog } from '../shared/logging';

export class ChapterContent {
  private static readonly bookmarkButtonId = `toolbarBookmarkButton`;

  private chapters: Map<StoryUrl, UserChapterInfo>;
  private currentChapter: UserChapterInfo;
  private url: string; // all extra params stripped off
  private previousScrollY: number = 0;
  private bookmarkY: number = 0; // Relative to the top of the bg-content's top, *not* the first paragraph.
  private isHighlightvisible: boolean = false;

  private bookmarkParent: HTMLElement | null = null;
  private contentDiv: HTMLElement | null = null;
  private contentParagraphs: HTMLElement[] | null = null;
  private firstParagraph: HTMLElement | null = null;
  private lastParagraph: HTMLElement | null = null;
  private bookmarkDiv: HTMLDivElement | null = null;
  private selectedParagraph: HTMLElement | null = null;
  private bookmarkedParagraph: HTMLElement | null = null;
  private paragraphHighlight: HTMLDivElement | null = null;
  private paragraphToolbar: HTMLDivElement | null = null;
  private scrubberContainer: HTMLDivElement | null = null;
  private scrubberBar: HTMLDivElement | null = null;
  private scrubberCircleContainer: HTMLDivElement | null = null;
  private scrubberCircle: HTMLDivElement | null = null;

  constructor(chapters: Map<StoryUrl, UserChapterInfo>, url: string) {
    this.chapters = chapters;
    this.url = url;
    this.currentChapter = this.chapters.get(this.url)!;

    this.previousWidth = window.innerWidth;
    this.setup();
  }

  // TODOS:
  // - Add buttons to toolbar:
  //    - Jump to: Top, Bottom, Bookmark
  private setup() {
    const backgroundDivResults = document.getElementsByClassName('bg-container');
    if (backgroundDivResults.length === 0) {
      wptLog(`Unable to find the bg-container div. Bailing...`);
      return;
    }
    this.bookmarkParent = backgroundDivResults[0] as HTMLElement;

    // Chapter content is inside `reader-content` classed div
    const contentDivResult = document.getElementById('reader-content');
    if (!contentDivResult) {
      wptLog(`Unable to find 'reader-content' div. Bailing...`);
      return;
    }

    this.contentDiv = contentDivResult;
    const contentParagraphsResult = this.contentDiv.getElementsByTagName('p');
    if (contentParagraphsResult.length === 0) {
      wptLog(`Unable to find any paragraphs in content. Bailing...`);
      return;
    }

    this.addParagraphClickListeners(this.contentDiv);
    this.injectParagraphHighlight(this.bookmarkParent);
    this.injectScrubber(this.bookmarkParent);
    this.addNextChapterListener(this.bookmarkParent);

    // ---Initial bookmark setup---

    // offsetParent filter removes any hidden paragraphs
    this.contentParagraphs = Array.from(contentParagraphsResult).filter(
      x => x.offsetParent !== null
    );

    this.firstParagraph = this.contentParagraphs[0];
    this.lastParagraph = this.contentParagraphs[this.contentParagraphs.length - 1];

    this.bookmarkDiv = document.createElement('div');
    this.bookmarkDiv.className = 'wpt-bookmark';
    this.bookmarkParent.prepend(this.bookmarkDiv);

    const firstParagraphTop = this.getAbsoluteY(this.firstParagraph);
    const backgroundTop = this.getAbsoluteY(this.bookmarkParent);
    this.bookmarkDiv.style.top = `${Math.floor(firstParagraphTop - backgroundTop)}px`;
    this.bookmarkedParagraph = this.firstParagraph;
    // ---

    if (this.currentChapter.paragraphIndex) {
      const paragraph = this.contentParagraphs[this.currentChapter.paragraphIndex];
      const paragraphTop = this.getAbsoluteY(paragraph);
      this.bookmarkDiv.style.top = `${Math.floor(paragraphTop - backgroundTop)}px`;
      this.bookmarkY = Math.floor(paragraphTop - backgroundTop);
      this.bookmarkedParagraph = paragraph;

      // Don't autoscroll to the bookmark if the chapter is complete,
      // because the user has probably come back to reference something
      if (!this.currentChapter.completed) {
        if (document.visibilityState === 'visible') {
          paragraph.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        } else {
          document.addEventListener('visibilitychange', this.boundOnLateVisibility);
        }
      }
    }

    // TODO: Add a listener to zoom or font size changed, too
    addEventListener('scroll', () => this.onScroll());
    addEventListener('resize', () => this.onResize());
    window.addEventListener('resize', () => this.updateScrubber());
  }

  // Binding the function to `this` so the eventListener has access to 'this`, and can also be removed later.
  private boundOnLateVisibility = this.onLateVisible.bind(this);
  private onLateVisible(): void {
    if (document.visibilityState === 'visible') {
      window.removeEventListener('visibilitychange', this.boundOnLateVisibility);
      if (this.currentChapter?.paragraphIndex && this.contentParagraphs) {
        const paragraph = this.contentParagraphs[this.currentChapter.paragraphIndex];
        paragraph.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  }

  private addNextChapterListener(bookmarkParent: HTMLElement): void {
    const navNextResult = bookmarkParent.getElementsByClassName('nav-next');
    if (navNextResult.length === 0) {
      return;
    }
    const lastLink = navNextResult.item(navNextResult.length - 1);
    if (!lastLink || !(lastLink instanceof HTMLElement)) {
      return;
    }

    lastLink.addEventListener('click', () => {
      if (!this.lastParagraph) {
        return;
      }
      this.setCompletion(this.lastParagraph, window.scrollY);
    });
  }

  private validClickTags = ['P', 'SPAN', 'PRE', 'CODE', 'STRONG', 'EM'];
  private prevClickX = 0;
  private prevClickY = 0;
  private addParagraphClickListeners(contentDiv: HTMLElement) {
    contentDiv.addEventListener('mousedown', (evt: MouseEvent) => {
      if (!(evt.target instanceof HTMLElement)) {
        return;
      }
      if (!this.validClickTags.includes(evt.target.tagName)) {
        return;
      }
      this.prevClickX = evt.clientX;
      this.prevClickY = evt.clientY;
    });
    contentDiv.addEventListener('click', (evt: MouseEvent) => {
      if (!(evt.target instanceof HTMLElement)) {
        return;
      }
      if (!this.validClickTags.includes(evt.target.tagName)) {
        return;
      }
      if (
        Math.abs(evt.clientX - this.prevClickX) > 5 ||
        Math.abs(evt.clientY - this.prevClickY) > 5
      ) {
        return;
      }

      if (this.isHighlightvisible && this.selectedParagraph == evt.target) {
        this.hideHighlight();
      } else {
        this.showHighlight(evt.target);
      }
      if (evt.target instanceof HTMLElement) {
        this.selectedParagraph = evt.target;
      }
      this.updateHighlight();
    });
  }

  private injectParagraphHighlight(bookmarkParent: HTMLElement): void {
    // First, the wrapper element that highlights paragraphs
    this.paragraphHighlight = document.createElement('div');
    this.paragraphHighlight.classList.add(`wpt-paragraph-highlight`);

    // Getting color in code because there's no way to work with CSS variables' alpha in pure CSS
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue(
      '--accent-primary'
    );
    // --accent-primary is hex, so let's RGB-ify it so we can mess with its alpha
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accentColor)!;
    const rgb = {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
    const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    this.paragraphHighlight.style.backgroundColor = `rgb(${rgbString}, 0.15)`;
    this.paragraphHighlight.style.borderTop = `1px solid rgb(${rgbString}, 0.25)`;
    this.paragraphHighlight.style.borderBottom = `1px solid rgb(${rgbString}, 0.25)`;

    this.paragraphHighlight.addEventListener('click', evt => {
      if (evt.target === this.paragraphHighlight) {
        this.hideHighlight();
      }
    });

    // Then, the button toolbar that sits above it
    this.paragraphToolbar = document.createElement('div');
    this.paragraphToolbar.classList.add(`wpt-toolbar`);
    // four buttons: bookmark/unbookmark, chapter to URL, all to URL, close button
    const bookmarkButton = document.createElement('button');
    bookmarkButton.id = ChapterContent.bookmarkButtonId;
    bookmarkButton.type = 'button';
    bookmarkButton.textContent = 'Bookmark';
    bookmarkButton.addEventListener('click', _ => {
      if (!this.selectedParagraph) {
        return;
      }
      if (this.bookmarkedParagraph && this.selectedParagraph === this.bookmarkedParagraph) {
        // Unbookmark
        if (this.firstParagraph) {
          this.setBookmark(this.firstParagraph, window.scrollY);
          this.setCompletion(this.firstParagraph, window.scrollY);
          this.updateHighlight();
        }
      } else {
        this.setBookmark(this.selectedParagraph, window.scrollY);
        this.setCompletion(this.selectedParagraph, window.scrollY);
        this.updateHighlight();
      }
    });
    this.paragraphToolbar.appendChild(bookmarkButton);

    const bookmarktoUrlButton = document.createElement('button');
    bookmarktoUrlButton.type = 'button';
    bookmarktoUrlButton.textContent = 'Bookmark to URL';
    bookmarktoUrlButton.addEventListener(`click`, _ => {
      this.bookmarkToUrl();
    });
    this.paragraphToolbar.appendChild(bookmarktoUrlButton);

    const jumpToBookmarkButton = document.createElement('button');
    jumpToBookmarkButton.type = 'button';
    jumpToBookmarkButton.textContent = 'Jump to Bookmark';
    jumpToBookmarkButton.addEventListener(`click`, _ => {
      if (this.bookmarkedParagraph) {
        this.bookmarkedParagraph.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
    this.paragraphToolbar.appendChild(jumpToBookmarkButton);

    const closeButton = document.createElement(`button`);
    closeButton.type = `button`;
    closeButton.textContent = `X`;
    closeButton.addEventListener(`click`, _ => {
      this.hideHighlight();
    });
    this.paragraphToolbar.appendChild(closeButton);

    this.paragraphHighlight.appendChild(this.paragraphToolbar);

    bookmarkParent.prepend(this.paragraphHighlight);
  }

  private bookmarkToUrl(): void {
    if (!this.selectedParagraph) {
      return;
    }
    const chapterUrl = window.location.origin + window.location.pathname;
    const serializedUrl = serializeChapterToUrl(chapterUrl, this.currentChapter);
    history.replaceState('', '', serializedUrl);
  }

  private updateHighlight() {
    if (!this.selectedParagraph || !this.paragraphHighlight || !this.bookmarkParent) {
      return;
    }

    if (!this.isHighlightvisible) {
      this.hideHighlight();
    }

    // Height and position
    const bookmarkParentTop = this.getAbsoluteY(this.bookmarkParent);
    const paragraphY = this.getAbsoluteY(this.selectedParagraph) - bookmarkParentTop;
    this.paragraphHighlight.style.transform = `translate(0px, ${Math.round(paragraphY)}px)`;
    this.paragraphHighlight.style.height = `${Math.round(this.selectedParagraph.offsetHeight)}px`;

    // Bookmark button text
    const bookmarkButton = document.getElementById(ChapterContent.bookmarkButtonId);
    if (bookmarkButton) {
      bookmarkButton.innerText =
        this.selectedParagraph === this.bookmarkedParagraph ? `Unbookmark` : `Bookmark`;
    }
  }

  private showHighlight(element: HTMLElement): void {
    this.isHighlightvisible = true;
    this.selectedParagraph = element;

    if (this.paragraphHighlight) {
      this.paragraphHighlight.classList.add('visible');
    }
  }

  private hideHighlight(): void {
    this.isHighlightvisible = false;
    if (this.paragraphHighlight) {
      this.paragraphHighlight.classList.remove('visible');
    }
  }

  private injectScrubber(bookmarkParent: HTMLElement): void {
    // div at the top, 4px tall horizontal bar that holds the scrubber
    // child div, scrubber, with position: absolute and background-color. left% and right% to position and shape the bar
    // child div of that, scrubberCircle, which is just a circle in the center of the scrubber bar. left, no right
    this.scrubberContainer = document.createElement('div');
    this.scrubberContainer.classList.add(`wpt-scrubber`);

    this.scrubberBar = document.createElement('div');
    this.scrubberBar.classList.add(`wpt-scrubber-bar`);

    this.scrubberCircleContainer = document.createElement(`div`);
    this.scrubberCircleContainer.classList.add(`wpt-scrubber-circle-container`);

    this.scrubberCircle = document.createElement('div');
    this.scrubberCircle.classList.add(`wpt-scrubber-circle`);
    this.scrubberCircleContainer.appendChild(this.scrubberCircle);

    this.scrubberContainer.appendChild(this.scrubberBar);
    this.scrubberContainer.appendChild(this.scrubberCircleContainer);
    bookmarkParent.prepend(this.scrubberContainer);

    this.updateScrubberPadding();
    this.updateScrubber();
  }

  private updateScrubberPadding(): void {
    if (!this.scrubberContainer || !this.bookmarkParent) {
      return;
    }

    // adjust paddings to overcome the bg-container tag's padding,
    // because it changes on resize, so we can't really do this in CSS
    const backgroundContainerPadding = getComputedStyle(this.bookmarkParent).padding;
    const negativePadding = `-${backgroundContainerPadding}`;
    this.scrubberContainer.style.marginLeft = negativePadding;
    this.scrubberContainer.style.marginRight = negativePadding;
  }

  private updateScrubber(): void {
    if (
      !this.scrubberContainer ||
      !this.scrubberBar ||
      !this.scrubberCircleContainer ||
      !this.scrubberCircle ||
      !this.bookmarkParent ||
      !this.contentDiv
    ) {
      return;
    }

    const contentRect = this.contentDiv.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const completionTop = -contentRect.top / contentRect.height; // if user is between 0.0 and 1.0 they're in the content
    const completionBottom = (-contentRect.top + viewportHeight) / contentRect.height;
    const completionMiddle = (completionTop + completionBottom) / 2;

    const leftFraction: number = Math.min(Math.max(completionTop, 0), 1);
    const rightFraction: number = Math.min(Math.max(completionBottom, 0), 1);

    this.scrubberBar.style.left = `${100 * leftFraction}%`;
    this.scrubberBar.style.right = `${100 - 100 * rightFraction}%`;

    if (completionMiddle > 1 || completionMiddle < 0) {
      this.scrubberCircleContainer.style.visibility = `hidden`;
    } else {
      this.scrubberCircleContainer.style.visibility = `visible`;
      this.scrubberCircleContainer.style.left = `${100 * completionMiddle}%`;
    }
  }

  /**
   * Called on scroll & resize. Automatically update the bookmark's position by detemrining
   * what the topmost-visible paragraph is.
   * @param yCoord The current y-coordinate of window.
   */
  private setBookmarkToFirstParagraphInViewport(yCoord: number): void {
    if (
      !this.firstParagraph ||
      !this.lastParagraph ||
      !this.bookmarkParent ||
      !this.contentParagraphs ||
      !this.bookmarkDiv
    ) {
      return;
    }

    // ignore any scrolling that doesn't land us inside the actual chapter text
    if (
      yCoord < this.getAbsoluteY(this.firstParagraph, yCoord) ||
      yCoord > this.getAbsoluteY(this.lastParagraph, yCoord)
    ) {
      return;
    }

    // Only move the bookmark if its new position would be further down than its old one.
    if (this.bookmarkY + this.getAbsoluteY(this.bookmarkParent, yCoord) <= yCoord) {
      // find the closest paragraph that's beeen scrolled up off the screen, set our bookmark there
      const nearestAboveParagraph = this.paragraphBinarySearch(this.contentParagraphs, yCoord);
      this.setBookmark(nearestAboveParagraph, yCoord);
      this.setCompletion(nearestAboveParagraph, yCoord);
    }
  }

  /**
   * Set chapter to completed if the bookmarked paragraph is near enough the bottom, and the
   * user scrolls beyond the content limits.
   * @param yCoord The absolute y-coordinate to which the user scrolled.
   */
  private maybeSetCompletedOnScroll(yCoord: number): void {
    if (!this.lastParagraph || !this.bookmarkedParagraph || !this.contentParagraphs) {
      return;
    }

    if (yCoord < this.getAbsoluteY(this.lastParagraph)) {
      return;
    }

    // Only mark a chapter as completed on scroll if the last time we updated the bookmark was
    // within 10 paragraphs of the end of the page.
    // We might false-positive if someone gets near the end of a chapter with some long final paragraphs,
    // then they scroll down to read some comments and never finish but...
    // ...eh.
    const bookmarkedIndex = this.contentParagraphs?.indexOf(this.bookmarkedParagraph);
    if (this.contentParagraphs.length - 1 - bookmarkedIndex > 10) {
      return;
    }

    this.setBookmark(this.lastParagraph, yCoord);
    this.setCompletion(this.lastParagraph, yCoord);
  }

  /**
   * Moves the bookmark to the specified paragraph.
   * @param paragraph Paragraph to move the bookmark atop.
   * @param yCoord The current y-coordinate of window.
   */
  private setBookmark(paragraph: HTMLElement, yCoord: number): void {
    if (
      !this.bookmarkParent ||
      !this.bookmarkDiv ||
      !this.contentParagraphs ||
      !this.lastParagraph
    ) {
      return;
    }

    this.bookmarkedParagraph = paragraph;

    // Moving the bookmark
    const selectedParagraphTop = this.getAbsoluteY(paragraph, yCoord);
    const backgroundTop = this.getAbsoluteY(this.bookmarkParent, yCoord);
    this.bookmarkY = Math.floor(selectedParagraphTop - backgroundTop);
    this.bookmarkDiv.style.top = `${this.bookmarkY}px`;

    // Update the page's URL
    this.bookmarkToUrl();
  }

  /**
   * Sets completion state to the given paragraph. The given paragraph is the last one,
   * sets chapter to completed.
   * @param paragraph The paragraph to set our completion marker at.
   * @param yCoord The current y-coordinate of the window.
   */
  private setCompletion(paragraph: HTMLElement, yCoord: number): void {
    if (!this.lastParagraph || !this.contentParagraphs) {
      return;
    }

    this.currentChapter.paragraphIndex = this.contentParagraphs.indexOf(paragraph);
    if (paragraph === this.lastParagraph) {
      this.currentChapter.completed = true;
      this.currentChapter.percentCompletion = 1.0;
    } else {
      const selectedParagraphTop = this.getAbsoluteY(paragraph, yCoord);
      const lastParagraphTop = this.getAbsoluteY(this.lastParagraph, yCoord);
      const percentCompletion = selectedParagraphTop / lastParagraphTop;

      this.currentChapter.percentCompletion = percentCompletion;
    }

    const updateChapterPayload = mapToString(
      new Map<StoryUrl, UserChapterInfo>([[this.url, this.currentChapter]])
    );
    browser.runtime.sendMessage(<BrowserMessage>{
      type: 'updateChapters',
      value: updateChapterPayload
    });
  }

  private paragraphBinarySearch(array: HTMLElement[], startingYCoord: number): HTMLElement {
    let front = 0;
    let back = array.length - 1;

    while (front < back) {
      let mid = (front + back) >> 1;
      const comparisonElement = array[mid];
      const comparisonTop = this.getAbsoluteY(comparisonElement, startingYCoord);

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
  private getAbsoluteY(elem: Element, ySource?: number): number {
    const yOffset: number = ySource ? ySource : window.scrollY;
    return elem.getBoundingClientRect().top + yOffset;
  }

  private debouncedScroll: (<U>(this: U) => void) | null = null;
  private onScroll(): void {
    if (!this.debouncedScroll) {
      this.debouncedScroll = debounce(1000, () => {
        const newY = window.scrollY;
        if (newY < this.previousScrollY) {
          this.previousScrollY = newY;
          return;
        }
        this.previousScrollY = newY;
        this.setBookmarkToFirstParagraphInViewport(newY);
        this.maybeSetCompletedOnScroll(newY);
      });
    }
    this.debouncedScroll();

    this.updateScrubber();
  }

  private previousWidth: number;
  private debouncedResize: (<U>(this: U) => void) | null = null;
  private onResize(): void {
    // Ignore resizes that don't change window width.
    // Mobile devices often show/hide the address bar on scroll,
    // which triggers a resize, which we don't actually care about.
    if (window.innerWidth === this.previousWidth) {
      return;
    }

    if (!this.debouncedResize) {
      this.debouncedResize = debounce(1000, () => {
        this.setBookmarkToFirstParagraphInViewport(window.scrollY);
        if (this.selectedParagraph) {
          this.setBookmark(this.selectedParagraph, window.scrollY);
        }
        this.updateHighlight();
      });
    }
    this.debouncedResize();

    this.updateScrubberPadding();
    this.updateScrubber();
    this.previousWidth = window.innerWidth;
  }
}
