import browser from 'webextension-polyfill';
import type { BrowserMessage, StoryUrl, UserChapterInfo } from "./models";
import { mapToString, serializeAllToUrl, serializeChapterToUrl } from "./serialization";
import { debounce } from "./timing";

export class ChapterContent {
    private chapters: Map<StoryUrl, UserChapterInfo>;
    private currentChapter: UserChapterInfo;
    private url: string; // all extra params stripped off
    private previousScrollY: number = 0;
    private bookmarkY: number = 0; // Relative to the <article> tag, *not* the first paragraph.
    private isOptionsVisible: boolean = false;
    private selectedParagraph: HTMLElement | null = null;

    private articleTag: HTMLElement | null = null;
    private contentDiv: HTMLElement | null = null;
    private contentParagraphs: HTMLParagraphElement[] | null = null;
    private firstParagraph: HTMLParagraphElement | null = null;
    private lastParagraph: HTMLParagraphElement | null = null;
    private bookmarkDiv: HTMLDivElement | null = null;
    private wptMenuButton: HTMLButtonElement | null = null;

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

        this.addClickListeners(this.contentDiv);

        // Inject extension control button onto chapter
        this.injectWptButton(this.articleTag);

        // ---Initial bookmark setup---

        // offsetParent filter removes any hidden paragraphs
        this.contentParagraphs = Array.from(contentParagraphsResult).filter(x => x.offsetParent !== null);

        this.firstParagraph = this.contentParagraphs[0];
        this.lastParagraph = this.contentParagraphs[this.contentParagraphs.length - 1];

        this.bookmarkDiv = document.createElement("div");
        this.bookmarkDiv.className = "bookmark";
        this.contentDiv.prepend(this.bookmarkDiv);

        const firstParagraphTop = this.getAbsoluteY(this.firstParagraph);
        const articleTop = this.getAbsoluteY(this.articleTag);
        this.bookmarkDiv.style.top = `${Math.floor(firstParagraphTop - articleTop)}px`;
        // ---

        if (this.currentChapter.paragraphIndex) {
            const paragraph = this.contentParagraphs[this.currentChapter.paragraphIndex];
            const paragraphTop = this.getAbsoluteY(paragraph);
            this.bookmarkDiv.style.marginTop = '-4px';
            this.bookmarkDiv.style.top = `${Math.floor(paragraphTop - articleTop)}px`;
            this.bookmarkY = Math.floor(paragraphTop - articleTop);

            // TODO: Make this a setting instead of unconditional
            this.hideBackgrounds();

            paragraph.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }

        const handleScroll = debounce(1000, (scrollEvent: any) => {
            const newY = window.scrollY;
            if (newY < this.previousScrollY) {
                this.previousScrollY = newY;
                return;
            };
            this.previousScrollY = newY;
            this.updateBookmarkAndCompletion(newY);
        });
        addEventListener('scroll', handleScroll);

        const handleResize = debounce(1000, (resizeEvent: any) => {
            this.updateBookmarkAndCompletion(window.scrollY);
        });
        addEventListener('resize', handleResize);

        // TODO: HTML replacement should include
        // - Content scrollbar at the top of the screen
        // - Bookmark red line thingy (DONE)
        // - onclick handler for all <p> elements
        // - floating box for <p> handler that allows bookmarking
        // - onscroll handler that tracks further-scrolled position on page  (DONE)
        //    (with throttle so a brief jaunt to the bottom doesn't count)
        //    (with range, so scrolling *beyond* the end of the actual content won't count as finishing)
    }

    private prevClickX = 0;
    private prevClickY = 0;
    private addClickListeners(contentDiv: HTMLElement) {
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
            if (!(evt.target instanceof HTMLElement)) {
                return;
            }
            if (Math.abs(evt.clientX - this.prevClickX) > 5 || Math.abs(evt.clientY - this.prevClickY) > 5) {
                return;
            }

            if (this.isOptionsVisible && this.selectedParagraph == evt.target) {
                this.hideOptions();
            } else {
                this.showOptions(evt.target);
            }
        });
    }

    private updateBookmarkAndCompletion(yCoord: number) {
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
            const nearestParagraphTop = this.getAbsoluteY(nearestAboveParagraph, yCoord);
            const articleTop = this.getAbsoluteY(this.articleTag, yCoord);
            this.bookmarkY = Math.floor(nearestParagraphTop - articleTop);
            this.bookmarkDiv.style.top = `${this.bookmarkY}px`;

            // Chapter completion
            const lastParagraphTop = this.getAbsoluteY(this.lastParagraph, yCoord);
            const percentCompletion = nearestParagraphTop / lastParagraphTop;

            this.currentChapter.paragraphIndex = this.contentParagraphs.indexOf(nearestAboveParagraph);
            this.currentChapter.percentCompletion = percentCompletion;

            const updateChapterPayload = mapToString(new Map<StoryUrl, UserChapterInfo>([[this.url, this.currentChapter]]));
            browser.runtime.sendMessage(<BrowserMessage>{
                type: 'updateChapters',
                value: updateChapterPayload
            });
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

    private showOptions(element: HTMLElement): void {
        this.isOptionsVisible = true;
        this.selectedParagraph = element;

        if (this.wptMenuButton) {
            this.wptMenuButton.style.display = `inline-block`;
        }
    }

    private hideOptions(): void {
        this.isOptionsVisible = false;
        if (this.wptMenuButton) {
            this.wptMenuButton.style.display = `none`;
        }
    }

    private injectWptButton(articleTag: HTMLElement): void {
        // Remove overflow: hidden from <main> tag, as its an ancestor of the WPT button,
        // and will prevent sticky from working
        const mainTagResponse = document.getElementsByTagName('main');
        if (mainTagResponse.length === 0) {
            console.log(`Unable to find <main> tag in chapter. Will not attempt to disable its overflow: hidden rule.`);
        } else {
            const mainTag = mainTagResponse[0];
            mainTag.style.overflow = 'visible';
        }

        // TODO: Rework this into options panel a-la Fimfic
        this.wptMenuButton = document.createElement('button');
        this.wptMenuButton.type = 'button';
        this.wptMenuButton.textContent = "WPT Menu";
        this.wptMenuButton.style.position = `sticky`;
        this.wptMenuButton.style.bottom = `0`;
        this.wptMenuButton.style.width = `100%`;
        this.wptMenuButton.onclick = (ev) => {
            browser.runtime.sendMessage(<BrowserMessage>{
                type: 'getChapters',
            }).then((chapterString: string) => {
                const chapterUrl = window.location.origin + window.location.pathname;
                const url = serializeChapterToUrl(chapterString, chapterUrl);
                history.replaceState(``, ``, url);
            });
        };
        // a <br> so the menu button isn't all up on the nav buttons
        articleTag.appendChild(document.createElement('br'));
        articleTag.appendChild(this.wptMenuButton);
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
}
