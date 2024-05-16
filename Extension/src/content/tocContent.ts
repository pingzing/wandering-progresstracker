import { wptLog } from '../shared/logging';
import type { StoryUrl, UserChapterInfo } from '../shared/models';

export class TocContent {
  private chapters: Map<StoryUrl, UserChapterInfo>;
  private tocDiv: HTMLElement | null = null;

  constructor(chapters: Map<StoryUrl, UserChapterInfo>) {
    this.chapters = chapters;
    this.setup();
  }

  private setup(): void {
    const tocDivResult = document.getElementById(`table-of-contents`);
    if (!tocDivResult) {
      wptLog(`Unable to find the ToC div. Bailing...`);
      return;
    }
    this.tocDiv = tocDivResult;

    const chapterCellsResult = this.tocDiv.getElementsByClassName(`body-web table-cell`);
    if (chapterCellsResult.length === 0) {
      wptLog(`Unable to find any body-web table-cells. Bailing...`);
    }

    const chapterCells: HTMLElement[] = Array.from(
      chapterCellsResult as HTMLCollectionOf<HTMLElement>
    );

    for (const chapterCell of chapterCells) {
      const parent: HTMLElement | null = chapterCell.parentElement;
      if (!parent) {
        continue;
      }

      const anchorChildResult = chapterCell.getElementsByTagName('a');
      if (anchorChildResult.length === 0) {
        wptLog(
          `Unabled to find anchor child for one of the body-web table-cells. Skipping...`
        );
        continue;
      }

      const firstAnchor = anchorChildResult[0];
      const chapterInfo: UserChapterInfo | undefined = this.chapters.get(firstAnchor.href);
      if (!chapterInfo) {
        continue;
      }

      this.injectCompletionPercentage(chapterCell, chapterInfo);
    }
  }

  private injectCompletionPercentage(chapterCell: HTMLElement, chapterInfo: UserChapterInfo) {
    // From fractional to percentage
    const percent = chapterInfo.percentCompletion * 100;
    const completedGreen = 'rgba(110, 166, 102, 0.45)';

    if (chapterInfo.completed) {
      chapterCell.style.background = completedGreen;
    } else {
      chapterCell.style.background = `linear-gradient(to right, #99ccff82 ${percent}%, transparent ${percent}%, transparent)`;
    }

    chapterCell.style.position = `relative`;

    const percentageDiv = document.createElement('div');
    percentageDiv.classList.add('wpt-toc-percentage');

    if (chapterInfo.completed) {
      // force this, because we allow completed chapters with non-100% completion,
      // with the plan to allow re-reads in the future
      percentageDiv.textContent = `100%`;
    } else {
      percentageDiv.textContent = `${this.round(percent, 2)}%`;
    }

    chapterCell.appendChild(percentageDiv);
  }

  private round(num: number, places: number) {
    return Number(num.toFixed(places));
  }
}
