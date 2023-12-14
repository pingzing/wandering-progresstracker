export type BrowserMessageType =
  | 'getColorScheme'
  | 'gotColorScheme'
  | 'getChapters'
  | 'addNewChapters'
  | 'updateChapters';

export type BrowserMessage = {
  type: BrowserMessageType;
  value?: any;
};

export type AppSettings = {
  tocLastChecked: Date | null;
};

export type StoryUrl = string;

export type ChapterInfo = {
  /**
   * Zero-indexed chapter number.
   */
  chapterIndex: number;

  /**
   * The given web serial name of the chapter, e.g. '9.65 (BH)'.
   */
  chapterName: string;
};

export type UserChapterInfo = ChapterInfo & {
  /**
   * Only true if the user has clicked "next" while at the end of a chapter,
   * or explicitly marked a chapter as complete.
   */
  completed: boolean; // TODO: do we need this, or can we just derive it by checking percentCompletion? or make it a function, and it won't get serialized

  /**
   * Value between 0.0 and 1.0.
   * A value of 1.0 does **not** necessarily imply completion.
   *
   * Used for display on the ToC. Should not be used for scrolling unless
   * paragraphIndex is null and we have no other choice.
   */
  percentCompletion: number;

  /**
   * The index of the <p> element at which the bookmark should be placed.
   * Null if the user has not yet started this chapter.
   */
  paragraphIndex: number | null;
};

export type UserData = {
  savedChapters: Map<StoryUrl, UserChapterInfo>;
};

// Placeholder, for now.
export const DEFAULT_SETTINGS: AppSettings = {
  tocLastChecked: null
};

export type ColorScheme = 'light' | 'dark';