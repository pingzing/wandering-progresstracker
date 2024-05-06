import type { ChapterInfo, UserChapterInfo, StoryUrl } from '../shared/models';
import userDataService from './userDataService';
import * as tocService from '../shared/tocService';
import { mapToString, stringToMap } from '../shared/serialization';
import { wptLog } from '../shared/logging';

// TODO: refactor this whole damn class, having to move from in-memory things to sessionStorage has made a mess of it
class ChapterService {
  private readonly domParser: DOMParser = new DOMParser();
  private static readonly sessionChaptersKey = `sessionChapters`;

  // TODO: Make this crossplat-Chrome friendly
  private session: browser.storage.StorageArea = browser.storage.session;

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
    // 0. Update if...
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

    // 3. If we need to update, fetch the ToC, then use that to get new chapter info.
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

    // 4. Once everything is up to date, first try to fetch chapter info from storage and
    // load it into the cache
    if (!userChaptersPayload) {
      const retrievedChapters = await userDataService.getChaptersFromStorage();
      await this.setSessionChapters(retrievedChapters);
    }

    // 5. Return the newly-loaded cache or, if we don't have anything stored, an empty map
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
      wptLog(
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
      wptLog(`Failed to persist chapters to storage. Error: ${e}`);
    }

    return userChapterMap;
  }

  private async getToc(): Promise<Document | null> {
    const tocResponse = await fetch('https://wanderinginn.com/table-of-contents/');
    if (!tocResponse.ok) {
      wptLog('Failed to fetch toc.');
      return null;
    }

    const responseText = await tocResponse.text();
    return this.domParser.parseFromString(responseText, 'text/html');
  }
}

const singleton = new ChapterService();
export default singleton;
