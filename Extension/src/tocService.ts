import type { ChapterInfo, StoryUrl } from "./models";

export function getChaptersFromToc(tocBody: Document): Map<StoryUrl, ChapterInfo> | null {
    const tableOfContentsDiv = tocBody.getElementById(`table-of-contents`);
    if (!tableOfContentsDiv) {
        return null;
    }

    const map = new Map<StoryUrl, ChapterInfo>();
    let chapterIndex = 0;

    // fragile scraping, aaaaaaa
    const volumeDivs = Array.from(tableOfContentsDiv.getElementsByClassName(`volume-wrapper`));
    for (const volumeDiv of volumeDivs) {
        const volumeChapters = Array.from(volumeDiv.getElementsByClassName(`chapter-entry`));
        for (const chapterDiv of volumeChapters) {
            const anchorTag = chapterDiv.getElementsByTagName(`a`)[0];
            map.set(anchorTag.href, {
                chapterIndex: chapterIndex,
                chapterName: anchorTag.text
            });
            chapterIndex += 1;
        }
    }

    return map;
}