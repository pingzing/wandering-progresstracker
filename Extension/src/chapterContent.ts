import browser from 'webextension-polyfill';
import type { BrowserMessage, StoryUrl, UserChapterInfo } from "./models";
import { mapToString, serializeAllToUrl, serializeChapterToUrl } from "./serialization";
import { debounce } from "./timing";

export class ChapterContent {
    private static readonly bookmarkButtonId = `toolbarBookmarkButton`;

    private chapters: Map<StoryUrl, UserChapterInfo>;
    private currentChapter: UserChapterInfo;
    private url: string; // all extra params stripped off
    private previousScrollY: number = 0;
    private bookmarkY: number = 0; // Relative to the <article> tag, *not* the first paragraph.
    private isHighlightvisible: boolean = false;

    private articleTag: HTMLElement | null = null;
    private contentDiv: HTMLElement | null = null;
    private contentParagraphs: HTMLParagraphElement[] | null = null;
    private firstParagraph: HTMLParagraphElement | null = null;
    private lastParagraph: HTMLParagraphElement | null = null;
    private bookmarkDiv: HTMLDivElement | null = null;
    private selectedParagraph: HTMLParagraphElement | null = null;
    private bookmarkedParagraph: HTMLParagraphElement | null = null;
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

        this.setup();
    }

    private setup() {
        // We need this, because it's the closest 'position: relative' ancestor, so that's what
        // the bookmark winds up being parented to.
        const articleTagResults = document.getElementsByTagName("article");
        if (articleTagResults.length === 0) {
            console.log(`Unable to find the article tag. Bailing...`);
            return;
        }
        this.articleTag = articleTagResults[0];

        // Chapter content is inside `entry-content` classed div
        const contentDivResult = document.getElementsByClassName('entry-content');
        if (contentDivResult.length === 0) {
            console.log(`Unable to find 'entry-content' div. Bailing...`);
            return;
        }

        this.contentDiv = contentDivResult[0] as HTMLElement;
        const contentParagraphsResult = this.contentDiv.getElementsByTagName('p');
        if (contentParagraphsResult.length === 0) {
            console.log(`Unable to find any paragraphs in content. Bailing...`)
            return;
        }

        this.addParagraphClickListeners(this.contentDiv);

        // Inject extension control button onto chapter
        this.injectParagraphHighlight(this.articleTag);

        // Inject chapter scrubber
        this.injectScrubber(this.articleTag);

        // ---Initial bookmark setup---

        // offsetParent filter removes any hidden paragraphs
        this.contentParagraphs = Array.from(contentParagraphsResult).filter(x => x.offsetParent !== null);

        this.firstParagraph = this.contentParagraphs[0];
        this.lastParagraph = this.contentParagraphs[this.contentParagraphs.length - 1];

        this.bookmarkDiv = document.createElement("div");
        this.bookmarkDiv.className = "wpt-bookmark";
        this.contentDiv.prepend(this.bookmarkDiv);

        const firstParagraphTop = this.getAbsoluteY(this.firstParagraph);
        const articleTop = this.getAbsoluteY(this.articleTag);
        this.bookmarkDiv.style.top = `${Math.floor(firstParagraphTop - articleTop)}px`;
        this.bookmarkedParagraph = this.firstParagraph;
        // ---

        if (this.currentChapter.paragraphIndex) {
            const paragraph = this.contentParagraphs[this.currentChapter.paragraphIndex];
            const paragraphTop = this.getAbsoluteY(paragraph);
            this.bookmarkDiv.style.marginTop = '-4px';
            this.bookmarkDiv.style.top = `${Math.floor(paragraphTop - articleTop)}px`;
            this.bookmarkY = Math.floor(paragraphTop - articleTop);
            this.bookmarkedParagraph = paragraph;

            // TODO: Make this a setting instead of unconditional
            this.hideBackgrounds();

            paragraph.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }

        // TODO: Add a listener to zoom or font size changed, too
        addEventListener('scroll', () => this.onScroll());
        addEventListener('resize', () => this.onResize());
        window.addEventListener('resize', () => this.updateScrubber());
    }

    private prevClickX = 0;
    private prevClickY = 0;
    private addParagraphClickListeners(contentDiv: HTMLElement) {
        contentDiv.addEventListener('mousedown', (evt: MouseEvent) => {
            console.log(`got mousedown`);
            if (!(evt.target instanceof Element)) {
                return;
            }
            if (evt.target.tagName !== 'P') {
                return;
            }
            this.prevClickX = evt.clientX;
            this.prevClickY = evt.clientY;
        });
        contentDiv.addEventListener('click', (evt: MouseEvent) => {
            if (!(evt.target instanceof HTMLParagraphElement)) {
                return;
            }
            if (Math.abs(evt.clientX - this.prevClickX) > 5 || Math.abs(evt.clientY - this.prevClickY) > 5) {
                return;
            }

            if (this.isHighlightvisible && this.selectedParagraph == evt.target) {
                this.hideHighlight();
            } else {
                this.showHighlight(evt.target);
            }
            if (evt.target instanceof HTMLParagraphElement) {
                this.selectedParagraph = evt.target;
            }
            this.updateHighlight();
        });
    }

    private injectParagraphHighlight(articleTag: HTMLElement): void {
        // First, the wrapper element that highlights paragraphs
        this.paragraphHighlight = document.createElement('div');
        this.paragraphHighlight.classList.add(`wpt-paragraph-highlight`);

        // Getting color in code because there's no way to work with CSS variables' alpha in pure CSS
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary');
        // --accent-primary is hex, so let's RGB-ify it so we can mess with its alpha
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accentColor)!;
        const rgb = { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
        const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
        this.paragraphHighlight.style.backgroundColor = `rgb(${rgbString}, 0.15)`;
        this.paragraphHighlight.style.borderTop = `1px solid rgb(${rgbString}, 0.25)`;
        this.paragraphHighlight.style.borderBottom = `1px solid rgb(${rgbString}, 0.25)`;

        this.paragraphHighlight.addEventListener('click', (evt) => {
            if (evt.target === this.paragraphHighlight) { this.hideHighlight(); }
        });

        // Then, the button toolbar that sits above it
        this.paragraphToolbar = document.createElement('div');
        this.paragraphToolbar.classList.add(`wpt-toolbar`);
        // four buttons: bookmark/unbookmark, chapter to URL, all to URL, close button
        const bookmarkButton = document.createElement('button');
        bookmarkButton.id = ChapterContent.bookmarkButtonId;
        bookmarkButton.type = 'button';
        bookmarkButton.textContent = "Bookmark";
        bookmarkButton.addEventListener('click', (_) => {
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

        const chapterToUrlButton = document.createElement('button');
        chapterToUrlButton.type = 'button';
        chapterToUrlButton.textContent = "Chapter to URL";
        chapterToUrlButton.addEventListener(`click`, (_) => {
            if (!this.selectedParagraph) {
                return;
            }
            const chapterUrl = window.location.origin + window.location.pathname;
            const serializedUrl = serializeChapterToUrl(chapterUrl, this.currentChapter);
            history.pushState(``, ``, serializedUrl);
        });
        this.paragraphToolbar.appendChild(chapterToUrlButton);

        const allToUrlButton = document.createElement('button');
        allToUrlButton.type = 'button';
        allToUrlButton.textContent = 'All to URL';
        allToUrlButton.addEventListener(`click`, (_) => {
            browser.runtime.sendMessage(<BrowserMessage>{
                type: `getChapters`,
            }).then((chapterString) => {
                const chapterUrl = window.location.origin + window.location.pathname;
                const url = serializeAllToUrl(chapterUrl, chapterString);
                history.replaceState(``, ``, url);
            })
        });
        this.paragraphToolbar.appendChild(allToUrlButton);

        const closeButton = document.createElement(`button`);
        closeButton.type = `button`;
        closeButton.textContent = `\u2716`; // ✖
        closeButton.addEventListener(`click`, (_) => {
            this.hideHighlight();
        });
        this.paragraphToolbar.appendChild(closeButton);

        this.paragraphHighlight.appendChild(this.paragraphToolbar)

        articleTag.prepend(this.paragraphHighlight);
    }

    private updateHighlight() {
        if (!this.selectedParagraph
            || !this.paragraphHighlight
            || !this.articleTag) {
            return;
        }

        if (!this.isHighlightvisible) {
            this.hideHighlight();
        }

        // Height and position
        const articleTop = this.getAbsoluteY(this.articleTag);
        const paragraphY = this.getAbsoluteY(this.selectedParagraph) - articleTop;
        this.paragraphHighlight.style.transform = `translate(0px, ${Math.round(paragraphY)}px)`;
        this.paragraphHighlight.style.height = `${Math.round(this.selectedParagraph.offsetHeight)}px`;

        // Bookmark button text
        const bookmarkButton = document.getElementById(ChapterContent.bookmarkButtonId);
        if (bookmarkButton) {
            bookmarkButton.innerText = this.selectedParagraph === this.bookmarkedParagraph ? `Unbookmark` : `Bookmark`;
        }
    }

    private showHighlight(element: HTMLParagraphElement): void {
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

    private injectScrubber(articleTag: HTMLElement): void {
        // Remove overflow: hidden from <main> tag, as its an ancestor of the scrubber bar button,
        // and will prevent sticky from working
        const mainTagResponse = document.getElementsByTagName('main');
        if (mainTagResponse.length === 0) {
            console.log(`Unable to find <main> tag in chapter. Skipping injecting scrubber bar.`);
            return;
        } else {
            const mainTag = mainTagResponse[0];
            mainTag.style.overflow = 'visible';
        }

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
        articleTag.prepend(this.scrubberContainer);

        this.updateScrubberPadding();
        this.updateScrubber();
    }

    private updateScrubberPadding(): void {
        if (!this.scrubberContainer || !this.articleTag) {
            return;
        }

        // adjust paddings to overcome the article tag's padding,
        // because it changes on resize, so we can't really do this in CSS
        const articlePadding = getComputedStyle(this.articleTag).padding;
        const negativePadding = `-${articlePadding}`;
        this.scrubberContainer.style.marginLeft = negativePadding;
        this.scrubberContainer.style.marginRight = negativePadding;
        this.scrubberContainer.style.marginTop = negativePadding;
    }

    private updateScrubber(): void {
        if (!this.scrubberContainer
            || !this.scrubberBar
            || !this.scrubberCircleContainer
            || !this.scrubberCircle
            || !this.articleTag
            || !this.contentDiv) {
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

    private hideBackgrounds() {
        // parallax perf really sucks in Firefox, especailly on mobile, so hide them
        // we'll make this a user-configurable setting later
        const parallaxLayers = document.getElementsByClassName('winter-parallax-layer');
        for (let i = 0; i < parallaxLayers.length; i++) {
            const layer = parallaxLayers[i] as HTMLElement;
            layer.style.display = `none`;
        }
    }

    /**
     * Called on scroll & resize. Automatically update the bookmark's position by detemrining
     * what the topmost-visible paragraph is.
     * @param yCoord The current y-coordinate of window.
     */
    private setBookmarkToFirstParagraphInViewport(yCoord: number): void {
        if (!this.firstParagraph ||
            !this.lastParagraph ||
            !this.articleTag ||
            !this.contentParagraphs ||
            !this.bookmarkDiv) {
            return;
        }

        // ignore any scrolling that doesn't land us inside the actual chapter text
        if (yCoord < this.getAbsoluteY(this.firstParagraph, yCoord) || yCoord > this.getAbsoluteY(this.lastParagraph, yCoord)) {
            return;
        }

        // Only move the bookmark if its new position would be further down than its old one.
        if (this.bookmarkY + this.getAbsoluteY(this.articleTag, yCoord) <= yCoord) {
            // find the closest paragraph that's beeen scrolled up off the screen, set our bookmark there
            const nearestAboveParagraph = this.paragraphBinarySearch(this.contentParagraphs, yCoord);
            this.setBookmark(nearestAboveParagraph, yCoord);
            this.setCompletion(nearestAboveParagraph, yCoord);
        }
    }

    /**
     * Moves the bookmark to the specified paragraph.
     * @param paragraph Paragraph to move the bookmark atop.
     * @param yCoord The current y-coordinate of window.
     */
    private setBookmark(paragraph: HTMLParagraphElement, yCoord: number): void {
        if (!this.articleTag
            || !this.bookmarkDiv
            || !this.contentParagraphs
            || !this.lastParagraph) {
            return;
        }

        this.bookmarkedParagraph = paragraph;

        // Moving the bookmark
        const selectedParagraphTop = this.getAbsoluteY(paragraph, yCoord);
        const articleTop = this.getAbsoluteY(this.articleTag, yCoord);
        this.bookmarkY = Math.floor(selectedParagraphTop - articleTop);
        this.bookmarkDiv.style.top = `${this.bookmarkY}px`;
    }

    /**
     * Sets completion state to the given paragraph.
     * @param paragraph The paragraph to set our completion marker at.
     * @param yCoord The current y-coordinate of the window.
     */
    private setCompletion(paragraph: HTMLParagraphElement, yCoord: number): void {
        if (!this.lastParagraph
            || !this.contentParagraphs) {
            return;
        }

        const selectedParagraphTop = this.getAbsoluteY(paragraph, yCoord);

        // Chapter completion
        const lastParagraphTop = this.getAbsoluteY(this.lastParagraph, yCoord);
        const percentCompletion = selectedParagraphTop / lastParagraphTop;

        this.currentChapter.paragraphIndex = this.contentParagraphs.indexOf(paragraph);
        this.currentChapter.percentCompletion = percentCompletion;
        if (paragraph === this.lastParagraph) {
            this.currentChapter.completed = true;
        }

        const updateChapterPayload = mapToString(new Map<StoryUrl, UserChapterInfo>([[this.url, this.currentChapter]]));
        browser.runtime.sendMessage(<BrowserMessage>{
            type: 'updateChapters',
            value: updateChapterPayload
        });
    }

    private paragraphBinarySearch(array: HTMLParagraphElement[], startingYCoord: number): HTMLParagraphElement {
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
                };
                this.previousScrollY = newY;
                this.setBookmarkToFirstParagraphInViewport(newY);
            });
        }
        this.debouncedScroll();

        this.updateScrubber();
    }

    private debouncedResize: (<U>(this: U) => void) | null = null;
    private onResize(): void {
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
    }
}
