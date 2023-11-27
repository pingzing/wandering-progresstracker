import browser from 'webextension-polyfill';
import type { ChapterInfo, ChapterUserInfo, StoryUrl, UserData } from './models';

class UserDataService {
    private static readonly savedChaptersCountKey = `savedChaptersCount`;
    private static readonly savedChaptersKeyPrefix = 'savedChapters-';

    /**
     * Get saved user data, including chapter progress.
     */
    public async getUserData(): Promise<UserData> {
        const data = (await browser.storage.sync.get(UserDataService.savedChaptersKeyPrefix))[
            UserDataService.savedChaptersKeyPrefix
        ];

        if (!data || Object.keys(data).length === 0) {
            console.log(`No user data found, creating empty data.`)
            const emptyUserData: UserData = {
                savedChapters: new Map<StoryUrl, ChapterUserInfo>()
            };
            return emptyUserData;
        }

        const deserializedData = this.deserialize(data);
        return { savedChapters: deserializedData };
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

        await browser.storage.sync.set({
            [UserDataService.savedChaptersKeyPrefix]: this.serialize(savedChapters)
        });
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

        await browser.storage.sync.set({
            [UserDataService.savedChaptersKeyPrefix]: this.serialize(savedChapters)
        });
    }

    private async getChaptersFromStorage(): Promise<Map<StoryUrl, ChapterUserInfo>> {
        const chapterCount = (await browser.storage.sync.get(UserDataService.savedChaptersCountKey))[UserDataService.savedChaptersCountKey] as number;
    }

    /**
     * Overwrite saved chapters.
     * Must send *all* known chapters.
     * Warning: expensive.
     * @param allChapters **ALL** known chapters.
     */
    private async saveChaptersToStorage(allChapters: Map<StoryUrl, ChapterUserInfo>): Promise<void> {
        const chunkSize = 50;
        const iterableChapters = Array.from(allChapters.entries());
        const chaptersToSave: { key: string, value: { [k: StoryUrl]: ChapterUserInfo } }[] = [];
        let savedChapterCount = 0;
        for (let i = 0; i < iterableChapters.length; i += chunkSize) {
            const chunk = iterableChapters.slice(i, i + chunkSize);
            const objectifiedChapterChunk = Object.fromEntries(chunk);

            chaptersToSave.push({
                key: `${UserDataService.savedChaptersKeyPrefix}-${savedChapterCount}`,
                value: objectifiedChapterChunk
            });

            savedChapterCount += 1;
        }

        for (const chapterChunk of chaptersToSave) {
            await browser.storage.sync.set({
                [chapterChunk.key]: chapterChunk.value
            });
        }

        await browser.storage.sync.set({
            [UserDataService.savedChaptersCountKey]: savedChapterCount
        });
    }

    private serialize(map: Map<StoryUrl, ChapterUserInfo>): string {
        const object = Object.fromEntries(map.entries());
        return JSON.stringify(object);
    }

    private deserialize(serializedMap: string): Map<StoryUrl, ChapterUserInfo> {
        const object = JSON.parse(serializedMap);
        return new Map(Object.entries(object));
    }
}

const singleton = new UserDataService();
export default singleton;
