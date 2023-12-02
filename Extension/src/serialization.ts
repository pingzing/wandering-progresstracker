import type { StoryUrl, UserChapterInfo } from "./models";

export function mapToString<K, V>(map: Map<K, V>): string {
    return JSON.stringify(Array.from(map.entries()));
}

export function stringToMap<K, V>(jsonText: string): Map<K, V> {
    return new Map(JSON.parse(jsonText));
}

export function serializeAllToUrl(mapString: string): URL {
    const map = stringToMap<StoryUrl, UserChapterInfo>(mapString);
    const completions: number[] = [];
    for (const entry of map) {
        completions.push(entry[1].paragraphIndex ?? 0);
    }
    const completionString = completions.join(`.`);
    const chapterUrl = window.location.origin + window.location.pathname;
    const url = new URL(chapterUrl);
    url.searchParams.append("wpt", completionString);
    return url;
}

export function serializeChapterToUrl(mapString: string): URL | null {
    const map = stringToMap<StoryUrl, UserChapterInfo>(mapString);
    const chapterUrl = window.location.origin + window.location.pathname;
    const chapterData = map.get(chapterUrl);
    if (!chapterData) {
        console.log(`No chapter data found for ${chapterUrl}. Can't serialize.`);
        return null;
    }
    const dataString = JSON.stringify(chapterData);
    const url = new URL(chapterUrl);
    url.searchParams.append(`wptc`, dataString);
    return url;
}