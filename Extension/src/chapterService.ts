import type { ChapterInfo, UserChapterInfo, StoryUrl } from './models';
import userDataService from './userDataService';
import * as tocService from './tocService';
import { mapToString, stringToMap } from './serialization';

// webextension-polyfill doesn't include browser.storage.session, so
// we jump down the dynamic trap-door to allow us to try to reference it
// note: this will 100% break on older browsers, but ¯\_(ツ)_/¯
let browser: any;
if (typeof (globalThis as any).browser === 'undefined') {
  browser = (globalThis as any).chrome;
} else {
  browser = (globalThis as any).browser;
}

class ChapterService {
  private readonly domParser: DOMParser = new DOMParser();
  private static readonly sessionChaptersKey = `sessionChapters`;
  private session = browser.storage.session;

  private async getSessionChapters(): Promise<string | null> {
    const resultObject = await this.session.get(ChapterService.sessionChaptersKey);
    if (Object.keys(resultObject).length === 0) {
      return null;
    }
    return resultObject[ChapterService.sessionChaptersKey];
  }

  private setSessionChapters(chapters: Map<StoryUrl, UserChapterInfo>): Promise<void> {
    return this.session.set({
      [ChapterService.sessionChaptersKey]: mapToString(chapters)
    });
  }

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
    let userChaptersPayload = await this.getSessionChapters();
    if (!userChaptersPayload) {
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
      userChaptersPayload = await this.getSessionChapters();
      await userDataService.setTocLastUpdated(new Date(Date.now()));
    }

    if (!userChaptersPayload) {
      const retrievedChapters = await userDataService.getChaptersFromStorage();
      await this.setSessionChapters(retrievedChapters);
    }

    userChaptersPayload = await this.getSessionChapters();
    if (!userChaptersPayload) {
      return new Map<StoryUrl, UserChapterInfo>();
    }
    return stringToMap(userChaptersPayload);
  }

  public async addNewChapters(parsedChapters: Map<StoryUrl, ChapterInfo>): Promise<void> {
    let chaptersToAdd = new Map<StoryUrl, ChapterInfo>();

    const sessionChaptersPayload = await this.getSessionChapters();
    let currentSessionChapters: Map<StoryUrl, UserChapterInfo> | null = null;
    if (!sessionChaptersPayload) {
      chaptersToAdd = parsedChapters;
    } else {
      for (const [chapterUrl, chapterInfo] of parsedChapters) {
        currentSessionChapters = stringToMap(sessionChaptersPayload);
        if (!currentSessionChapters.has(chapterUrl)) {
          chaptersToAdd.set(chapterUrl, chapterInfo);
        }
      }
    }

    if (!currentSessionChapters) {
      currentSessionChapters = new Map<StoryUrl, UserChapterInfo>();
    }

    for (const [chapterUrl, chapterInfo] of chaptersToAdd) {
      currentSessionChapters.set(chapterUrl, {
        chapterIndex: chapterInfo.chapterIndex,
        chapterName: chapterInfo.chapterName,
        completed: false,
        percentCompletion: 0.0,
        paragraphIndex: null
      });
    }

    await this.setSessionChapters(currentSessionChapters);
  }

  public async updateChapters(
    updatedChapters: Map<StoryUrl, UserChapterInfo>
  ): Promise<Map<StoryUrl, UserChapterInfo> | null> {
    const userChapterPayload = await this.getSessionChapters();
    if (!userChapterPayload) {
      console.log(
        `Somehow this.userChapters is still not initialized. This is an error!  Oh no. Bailing.`
      );
      return null;
    }

    const userChapterMap = stringToMap<StoryUrl, UserChapterInfo>(userChapterPayload);
    for (const [updated, chapterInfo] of updatedChapters) {
      userChapterMap.set(updated, chapterInfo);
    }
    await this.setSessionChapters(userChapterMap);

    // TODO: only do this occasionally (on tab close?)
    // rather than *every* update
    try {
      await userDataService.saveChaptersToStorage(userChapterMap);
    } catch (e) {
      console.log(`Failed to persist chapters to storage. Error: ${e}`);
    }

    return userChapterMap;
  }

  private async getToc(): Promise<Document | null> {
    const tocResponse = await fetch('https://wanderinginn.com/table-of-contents/');
    if (!tocResponse.ok) {
      console.log('Failed to fetch toc.');
      return null;
    }

    const responseText = await tocResponse.text();
    return this.domParser.parseFromString(responseText, 'text/html');
  }
}

const singleton = new ChapterService();
export default singleton;
