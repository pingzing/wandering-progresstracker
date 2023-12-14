import type { StoryUrl, UserChapterInfo } from "./models";
import { ChapterStateKey, FullStateKey } from "./consts";

export type ChapterString = string;
export function mapToString<K, V>(map: Map<K, V>): ChapterString {
    return JSON.stringify(Array.from(map.entries()));
}

export function stringToMap<K, V>(jsonText: ChapterString): Map<K, V> {
    return new Map(JSON.parse(jsonText));
}

export function serializeAllToUrl(currentUrl: string, mapString: ChapterString): URL {
    const map = stringToMap<StoryUrl, UserChapterInfo>(mapString);
    const completions: number[] = [];
    for (const entry of map) {
        completions.push(entry[1].paragraphIndex ?? 0);
    }
    const completionString = completions.join(`.`);
    const url = new URL(currentUrl);
    url.searchParams.append("wpt", completionString);
    return url;
}

export type ParagraphIndices = number[];
export function deserializeAllFromUrl(chapterUrl: URL): ParagraphIndices | null {
    const indicesString = chapterUrl.searchParams.get(FullStateKey);
    if (!indicesString) {
        wptLog(`Unable to find 'wpt' query param in URL.`)
        return null;
    }

    try {
        const paragraphIndices: ParagraphIndices = indicesString.split(`.`).map(x => parseInt(x, 10));
        return paragraphIndices
    }
    catch (e) {
        wptLog(`Failed to parse paragraph indices out of query string.`);
        return null;
    }
}

export function serializeChapterToUrl(chapterUrl: string, chapterData: UserChapterInfo): URL | null {
    const dataString = JSON.stringify(chapterData);
    const url = new URL(chapterUrl);
    url.searchParams.append(`wptc`, dataString);
    return url;
}

export function deserializeChapterFromUrl(chapterUrl: URL): UserChapterInfo | null {
    const payload = chapterUrl.searchParams.get(ChapterStateKey)
    if (!payload) {
        wptLog(`Unable to find 'wptc' query param in chapter URL.`);
        return null;
    }
    try {
        const chapterData: UserChapterInfo = JSON.parse(payload);
        return chapterData;
    }
    catch (e) {
        wptLog(`Unable to parse UserChapterInfo object from 'wptc' query param.`);
        return null;
    }
}