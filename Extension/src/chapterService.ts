import type { ChapterInfo, UserChapterInfo, StoryUrl } from './models';
import userDataService from './userDataService';
import * as tocService from './tocService';
import { mapToString, stringToMap } from './serialization';

class ChapterService {
  private static readonly userChapterKey = 'userChapterSession';
  private getChaptersFromSession(): Map<StoryUrl, UserChapterInfo> | null {
    const payload = sessionStorage.getItem(ChapterService.userChapterKey);
    return payload === null ? null : stringToMap(payload);
  }

  private setChaptersToSession(chapters: Map<StoryUrl, UserChapterInfo> | null): void {
    if (chapters) {
      sessionStorage.setItem(ChapterService.userChapterKey, mapToString(chapters));
    }
  }

  private static readonly domParser = new DOMParser();

  public async getChapters(): Promise<Map<StoryUrl, UserChapterInfo>> {
    // Update if...
    let shouldUpdate: boolean = false;

    // 1. The ToC is out of date, or has never been fetched
    const tocLastUpdated: Date | null = await userDataService.getTocLastUpdated();
    const utcNow = new Date(Date.now());
    if (!tocLastUpdated) {
      shouldUpdate = true;
    } else {
      const timeDiffMs = utcNow.getTime() - tocLastUpdated.getTime();
      const timeDiffMins = timeDiffMs / 1000 / 60;
      if (timeDiffMins > 60) {
        // i.e. get new ToC once every hour
        shouldUpdate = true;
      }
    }

    // 2. We don't have any in-memory data, AND have no saved data
    let userChapters = this.getChaptersFromSession();
    if (!userChapters) {
      const hasSavedData = await userDataService.hasSavedChapterData();
      shouldUpdate = !hasSavedData;
    }

    if (shouldUpdate) {
      const toc = await this.getToc();
      if (!toc) {
        return new Map<StoryUrl, UserChapterInfo>();
      }
      const parsedChapters = tocService.getChaptersFromToc(toc);
      if (!parsedChapters) {
        return new Map<StoryUrl, UserChapterInfo>();
      }
      await this.addNewChapters(parsedChapters);
      await userDataService.setTocLastUpdated(new Date(Date.now()));
    }

    if (!userChapters) {
      const retrievedChapters = await userDataService.getChaptersFromStorage();
      userChapters = retrievedChapters;
      this.setChaptersToSession(userChapters);
    }

    return userChapters;
  }

  public addNewChapters(parsedChapters: Map<StoryUrl, ChapterInfo>): void {
    let userChapters = this.getChaptersFromSession();
    let chaptersToAdd = new Map<StoryUrl, ChapterInfo>();
    if (!userChapters) {
      userChapters = new Map<StoryUrl, UserChapterInfo>();
      chaptersToAdd = parsedChapters;
    } else {
      for (const [chapterUrl, chapterInfo] of parsedChapters) {
        if (!userChapters.has(chapterUrl)) {
          chaptersToAdd.set(chapterUrl, chapterInfo);
        }
      }
    }

    for (const [chapterUrl, chapterInfo] of chaptersToAdd) {
      userChapters.set(chapterUrl, {
        chapterIndex: chapterInfo.chapterIndex,
        chapterName: chapterInfo.chapterName,
        completed: false,
        percentCompletion: 0.0,
        paragraphIndex: null
      });
    }
    this.setChaptersToSession(userChapters);
  }

  public async updateChapters(
    updatedChapters: Map<StoryUrl, UserChapterInfo>
  ): Promise<Map<StoryUrl, UserChapterInfo> | null> {
    let userChapters = this.getChaptersFromSession();
    if (!userChapters) {
      userChapters = await this.getChapters();
    }

    for (const [updated, chapterInfo] of updatedChapters) {
      userChapters.set(updated, chapterInfo);
    }
    this.setChaptersToSession(userChapters);

    // TODO: only do this occasionally (on tab close?)
    // rather than *every* update
    try {
      await userDataService.saveChaptersToStorage(userChapters);
    } catch (e) {
      console.log(`Failed to persist chapters to storage. Error: ${e}`);
    }

    return userChapters;
  }

  private async getToc(): Promise<Document | null> {
    const tocResponse = await fetch('https://wanderinginn.com/table-of-contents/');
    if (!tocResponse.ok) {
      console.log('Failed to fetch toc.');
      return null;
    }

    const responseText = await tocResponse.text();
    return ChapterService.domParser.parseFromString(responseText, 'text/html');
  }
}

const singleton = new ChapterService();
export default singleton;
