import browser from 'webextension-polyfill';
import type { ChapterInfo, UserChapterInfo, StoryUrl, UserData } from './models';
import { gzipSync, decompressSync, strFromU8, strToU8 } from 'fflate';

class UserDataService {
    private static readonly tocLastUpdatedKey = 'tocLastUpdated';
    private static readonly savedChapterChunkCountKey = `savedChapterChunks`;
    private static readonly savedChapterChunkKeyPrefix = 'chapterChunk';
    private static readonly textEncoder = new TextEncoder();
    private static readonly textDecoder = new TextDecoder();

    public async getTocLastUpdated(): Promise<Date | null> {
        const tocLastUpdated = (await browser.storage.sync.get(UserDataService.tocLastUpdatedKey))[UserDataService.tocLastUpdatedKey] as string | undefined;
        if (!tocLastUpdated) {
            return null;
        }

        return new Date(tocLastUpdated);
    }

    public async setTocLastUpdated(date: Date): Promise<void> {
        try {
            await browser.storage.sync.set({
                [UserDataService.tocLastUpdatedKey]: date
            });
        }
        catch(e) {
            console.log(`Failed to set tocLastUpdated: ${e}`);
        }
    }

    /**
     * Check to see if there exists some saved chapter data.
     * Does not validate whether or not the data is entirely valid.
     */
    public async hasSavedChapterData(): Promise<boolean> {
        const chunkCount = (await browser.storage.sync.get(UserDataService.savedChapterChunkCountKey))[UserDataService.savedChapterChunkCountKey] as number | undefined;
        if (!chunkCount || chunkCount === 0) {
            return false;
        }

        const keys = [...Array(chunkCount).keys()].map(x => `${UserDataService.savedChapterChunkKeyPrefix}-${x}`);
        const chunks = (await browser.storage.sync.get(keys));
        for (const key of keys) {
            // If at least one chunk exists, we'll call this good enough.
            // TODO for a later date: report any missing chunks?
            if (chunks[key] !== undefined) {
                return true;
            }
        }

        return false;
    }

    /**
     * Retrieves persisted chapter information. If no information exists, will return an empty map.
     */
    public async getChaptersFromStorage(): Promise<Map<StoryUrl, UserChapterInfo>> {
        const chunkCount = (await browser.storage.sync.get(UserDataService.savedChapterChunkCountKey))[UserDataService.savedChapterChunkCountKey] as number | undefined;
        if (!chunkCount || chunkCount === 0) {
            return new Map<StoryUrl, UserChapterInfo>();
        }

        const retrievedChapters = new Map<StoryUrl, UserChapterInfo>();
        const keys = [...Array(chunkCount).keys()].map(x => `${UserDataService.savedChapterChunkKeyPrefix}-${x}`);
        const chunks = (await browser.storage.sync.get(keys));
        for (const key of keys) {
            const serializedChunk = chunks[key];
            const deserializedChunk = this.deserialize(serializedChunk);
            for (const [url, chapterUserInfo] of deserializedChunk) {
                retrievedChapters.set(url, chapterUserInfo);
            }
        }

        return retrievedChapters;
    }

    /**
     * Overwrite saved chapters.
     * Must send *all* known chapters.
     * Warning: expensive.
     * @param allChapters **ALL** known chapters.
     */
    public async saveChaptersToStorage(allChapters: Map<StoryUrl, UserChapterInfo>): Promise<void> {

        // Break chapters into chunks, because there are too many to fit into a single storage entry. 
        // 10 is arbitrarily "probably small enough".
        const chunkSize = 10;
        const iterableChapters = Array.from(allChapters.entries());
        const chaptersToSave: { key: string, value: string }[] = [];
        let savedChapterChunkCount = 0;
        for (let i = 0; i < iterableChapters.length; i += chunkSize) {
            const chunk = iterableChapters.slice(i, i + chunkSize);

            chaptersToSave.push({
                key: `${UserDataService.savedChapterChunkKeyPrefix}-${savedChapterChunkCount}`,
                value: this.serialize(chunk),
            });

            savedChapterChunkCount += 1;
        }

        for (const chapterChunk of chaptersToSave) {
            await browser.storage.sync.set({
                [chapterChunk.key]: chapterChunk.value
            });
        }

        await browser.storage.sync.set({
            [UserDataService.savedChapterChunkCountKey]: savedChapterChunkCount
        });
    }

    private serialize(chapterChunk: [StoryUrl, UserChapterInfo][]): string {
        // When serializing, strip out the domain name to save space
        for (const entry of chapterChunk) {
            entry[0] = entry[0].replace(`https://wanderinginn.com`, ``);
        }

        // Also, compress to save even more space
        const string = JSON.stringify(chapterChunk);
        const byteString = UserDataService.textEncoder.encode(string);
        const compressedBytes = gzipSync(byteString);

        // And turn the compressed bytes BACK into a string, because we can't save Uint8Arrays directly.
        const stringifiedBytes = strFromU8(compressedBytes, true);
        return stringifiedBytes;
    }

    private deserialize(stringifiedCompressedBytes: string): [StoryUrl, UserChapterInfo][] {
        if (!stringifiedCompressedBytes.length || stringifiedCompressedBytes.length === 0) {
            throw new Error(`Invalid string length when calling deserialize. Received: ${stringifiedCompressedBytes}`);
        }
        const compressedBytes = strToU8(stringifiedCompressedBytes, true);
        const decompressedString = decompressSync(compressedBytes);
        const decodedString = UserDataService.textDecoder.decode(decompressedString);
        const chapterChunks: [StoryUrl, UserChapterInfo][] = JSON.parse(decodedString);
        for (const chunk of chapterChunks) {
            chunk[0] = `https://wanderinginn.com${chunk[0]}`;
        }
        return chapterChunks;
    }
}

const singleton = new UserDataService();
export default singleton;
