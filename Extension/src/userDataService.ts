import browser from 'webextension-polyfill';
import type { ChapterInfo, ChapterUserInfo, StoryUrl, UserData } from './models';
import { gzipSync, decompressSync, strFromU8, strToU8 } from 'fflate';

class UserDataService {
    private static readonly savedChapterChunkCountKey = `savedChaptersCount`;
    private static readonly savedChaptersKeyPrefix = 'savedChapters';
    private static readonly textEncoder = new TextEncoder();
    private static readonly textDecoder = new TextDecoder();

    /**
     * Get saved user data, including chapter progress.
     */
    public async getUserData(): Promise<UserData> {
        const savedChapterCount = (await browser.storage.sync.get(UserDataService.savedChapterChunkCountKey))[
            UserDataService.savedChapterChunkCountKey
        ] as number | undefined;

        if (!savedChapterCount || savedChapterCount === 0) {
            const emptyUserData: UserData = {
                savedChapters: new Map<StoryUrl, ChapterUserInfo>()
            };
            return emptyUserData;
        }

        return {
            savedChapters: await this.getChaptersFromStorage()
        };
    }

    /**
     * Adds new chapters to saved chapter info.
     * @param newChapters The set of chapters we've learned about, and don't have saved yet.
     */
    public async addNewChapters(newChapters: Map<StoryUrl, ChapterInfo>): Promise<void> {
        const { savedChapters } = await this.getUserData();
        for (const [url, chapterInfo] of newChapters) {
            savedChapters.set(url, {
                chapterIndex: chapterInfo.chapterIndex,
                chapterName: chapterInfo.chapterName,
                completed: false,
                percentCompletion: 0
            });
        }

        await this.saveChaptersToStorage(savedChapters);
    }

    /**
     * Update saved chapter information. Can be used to update chapters we know about, or add new chapters.
     * @param updatedChapters The set of chapters that need updating or adding.
     */
    public async updateChapters(updatedChapters: Map<StoryUrl, ChapterUserInfo>): Promise<void> {
        const { savedChapters } = await this.getUserData();
        for (const [url, chapterInfo] of updatedChapters) {
            savedChapters.set(url, chapterInfo);
        }

        await this.saveChaptersToStorage(savedChapters);
    }

    private async getChaptersFromStorage(): Promise<Map<StoryUrl, ChapterUserInfo>> {
        const chapterCount = (await browser.storage.sync.get(UserDataService.savedChapterChunkCountKey))[UserDataService.savedChapterChunkCountKey] as number | undefined;
        if (!chapterCount || chapterCount === 0) {
            return new Map<StoryUrl, ChapterUserInfo>();
        }

        const retrievedChapters = new Map<StoryUrl, ChapterUserInfo>();
        const keys = [...Array(chapterCount).keys()].map(x => `${UserDataService.savedChaptersKeyPrefix}-${x}`);
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
    private async saveChaptersToStorage(allChapters: Map<StoryUrl, ChapterUserInfo>): Promise<void> {

        // Break chapters into chunks, because there are too many to fit into a single storage entry. 
        // 10 is arbitrarily "probably small enough".
        const chunkSize = 10;
        const iterableChapters = Array.from(allChapters.entries());
        const chaptersToSave: { key: string, value: string }[] = [];
        let savedChapterCount = 0;
        for (let i = 0; i < iterableChapters.length; i += chunkSize) {
            const chunk = iterableChapters.slice(i, i + chunkSize);

            chaptersToSave.push({
                key: `${UserDataService.savedChaptersKeyPrefix}-${savedChapterCount}`,
                value: this.serialize(chunk),
            });

            savedChapterCount += 1;
        }        

        for (const chapterChunk of chaptersToSave) {
            await browser.storage.sync.set({
                [chapterChunk.key]: chapterChunk.value
            });
        }

        await browser.storage.sync.set({
            [UserDataService.savedChapterChunkCountKey]: savedChapterCount
        });
    }

    private serialize(chapterChunk: [StoryUrl, ChapterUserInfo][]): string {
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

    private deserialize(stringifiedCompressedBytes: string): [StoryUrl, ChapterUserInfo][] {
        if (!stringifiedCompressedBytes.length || stringifiedCompressedBytes.length === 0) {
            throw new Error(`Invalid string length when calling deserialize. Received: ${stringifiedCompressedBytes}`);
        }
        const compressedBytes = strToU8(stringifiedCompressedBytes, true);
        const decompressedString = decompressSync(compressedBytes);
        const decodedString = UserDataService.textDecoder.decode(decompressedString);
        const chapterChunks: [StoryUrl, ChapterUserInfo][] = JSON.parse(decodedString);
        for (const chunk of chapterChunks) {
            chunk[0] = `https://wanderinginn.com${chunk[0]}`;
        }
        return chapterChunks;
    }
}

const singleton = new UserDataService();
export default singleton;
