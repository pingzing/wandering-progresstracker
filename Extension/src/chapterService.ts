import type { ChapterInfo, UserChapterInfo, StoryUrl } from "./models";
import userDataService from './userDataService';
import * as tocService from './tocService';

class ChapterService {
    private readonly domParser: DOMParser = new DOMParser();
    private userChapters: Map<StoryUrl, UserChapterInfo> | null = null;
    private readonly emptyMap = new Map<StoryUrl, UserChapterInfo>();

    public async getChapters(): Promise<Map<StoryUrl, UserChapterInfo>> {
        const tocLastUpdated: Date | null = await userDataService.getTocLastUpdated();
        const utcNow = new Date(Date.now());
        let shouldUpdate: boolean = false;
        if (!tocLastUpdated) {
            shouldUpdate = true;
        } else {
            const timeDiffMs = utcNow.getTime() - tocLastUpdated.getTime();
            const timeDiffMins = timeDiffMs / 1000 / 60;
            if (timeDiffMins > 60) { // i.e. get new ToC once every hour
                shouldUpdate = true;
            }
        }

        if (shouldUpdate) {
            const toc = await this.getToc();
            if (!toc) {
                return this.emptyMap;
            }
            const parsedChapters = tocService.getChaptersFromToc(toc);
            if (!parsedChapters) {
                return this.emptyMap;
            }
            await this.addNewChapters(parsedChapters);
            await userDataService.setTocLastUpdated(new Date(Date.now()));
        }

        if (!this.userChapters) {
            const retrievedChapters = await userDataService.getChaptersFromStorage();
            this.userChapters = retrievedChapters;
        }

        return this.userChapters;
    }

    public async addNewChapters(parsedChapters: Map<StoryUrl, ChapterInfo>): Promise<void> {
        let chaptersToAdd = new Map<StoryUrl, ChapterInfo>();
        if (!this.userChapters) {
            this.userChapters = new Map<StoryUrl, UserChapterInfo>();
            chaptersToAdd = parsedChapters;
        } else {
            for (const [chapterUrl, chapterInfo] of parsedChapters) {
                if (!this.userChapters.has(chapterUrl)) {
                    chaptersToAdd.set(chapterUrl, chapterInfo);
                }
            }
        }

        for (const [chapterUrl, chapterInfo] of chaptersToAdd) {
            this.userChapters.set(chapterUrl, {
                chapterIndex: chapterInfo.chapterIndex,
                chapterName: chapterInfo.chapterName,
                completed: false,
                percentCompletion: 0.0
            })
        }
    }

    public async updateChapters(updatedChapters: Map<StoryUrl, UserChapterInfo>): Promise<void> {
        if (!this.userChapters) {
            console.log(`ChapterService's userChapters hasn't benn initialized yet. Cannot update chapter info.`);
            return;
        }
        for (const [updated, chapterInfo] of updatedChapters) {
            this.userChapters.set(updated, chapterInfo);
        }
    }

    private async getToc(): Promise<Document | null> {
        const tocResponse = await fetch("https://wanderinginn.com/table-of-contents/");
        if (!tocResponse.ok) {
            console.log("Failed to fetch toc.");
            return null;
        }

        const responseText = await tocResponse.text();
        return this.domParser.parseFromString(responseText, 'text/html');
    }
}

const singleton = new ChapterService();
export default singleton;