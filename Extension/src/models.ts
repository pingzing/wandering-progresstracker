export type BrowserMessageType = 'getColorScheme' | 'gotColorScheme' | 'requestToc';

export type BrowserMessage = {
  type: BrowserMessageType;
  value?: any;
};

export type AppSettings = {
  displayHelpMessage: boolean;
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
}

export type ChapterUserInfo = ChapterInfo & {
    /**
   * Only true if the user has clicked "next" while at the end of a chapter,
   * or explicitly marked a chapter as complete.
   */
    completed: boolean;

    /**
     * Value between 0.0 and 1.0.
     * A value of 1.0 does **not** necessarily imply completion.
     */
    percentCompletion: number;
};

export type UserData = {
  savedChapters: Map<StoryUrl, ChapterUserInfo>;
};

export const DEFAULT_SETTINGS: AppSettings = {
  displayHelpMessage: true,
  tocLastChecked: null,
};

export type ColorScheme = 'light' | 'dark';
