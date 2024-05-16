<script lang="ts">
  import webextBrowser from 'webextension-polyfill';
  import { ConfigTabSettingsKey } from '../background';
  import { wptLog } from '../shared/logging';
  import { type StoryUrl, type BrowserMessage, type UserChapterInfo } from '../shared/models';
  import * as serialization from '../shared/serialization';
  import { VolumeChapterCounts } from '../shared/consts';
  import settingsService  from '../background/settingsService';

  // main: (runs on load)

  const wanderingInnHostPermission = '*://wanderinginn.com/*';
  const inPopup = document.location.href.endsWith(`popup.html`);
  if (!inPopup) {
    const root = document.getElementsByTagName('html')[0];
    root.classList.add('show-scrollbar');
  }

  // Tracks whether or not the extension has origins permission for the wandering inn hostname
  // i.e. whether or the the extension is actually enabled or not
  let enabled: boolean = false;

  // Tracks user's progress. Asynchronously filled when the extension is enabled.
  let chapterGroups: UserChapterInfo[][] | null = null;

  // Settings stored in the settings services
  const initialAppSettingsPromise = settingsService.getAppSettings();

  // Set up initial value of 'enabled' and listeners for host permissions changing
  webextBrowser.permissions
    .contains({
      origins: [wanderingInnHostPermission]
    })
    .then(x => setEnabled(x));

  webextBrowser.permissions.onRemoved.addListener(onPermissionRemoved);
  webextBrowser.permissions.onAdded.addListener(onPermissionAdded);

  // End main

  function onPermissionRemoved(permissions: webextBrowser.Permissions.Permissions): void {
    if (permissions.origins?.some(x => wanderingInnHostPermission)) {
      setEnabled(false);
    }
  }

  function onPermissionAdded(permissions: webextBrowser.Permissions.Permissions): void {
    if (permissions.origins?.some(x => wanderingInnHostPermission)) {
      setEnabled(true);
    }
  }

  async function onEnabledClicked(): Promise<void> {
    webextBrowser.permissions.request({
      origins: [wanderingInnHostPermission]
    });
    if (inPopup) {
      window.close();
    }
    // updated 'enabled' is handled by the event handlers up above
  }

  async function setEnabled(newEnabled: boolean): Promise<void> {
    enabled = newEnabled;

    if (newEnabled) {
      const chapterString = await webextBrowser.runtime.sendMessage(<BrowserMessage>{
        type: 'getChapters'
      });
      const unsortedChapters = serialization.stringToMap<StoryUrl, UserChapterInfo>(chapterString);
      const sortedChapters = Array.from(unsortedChapters)
        .sort((a, b) => a[1].chapterIndex - b[1].chapterIndex)
        .map(x => x[1]);
      // Group chapters by volume
      let groups: UserChapterInfo[][] = [];
      let prevCount = 0;
      for (const chapterCount of VolumeChapterCounts) {
        const volumeSlice = sortedChapters.slice(prevCount, prevCount + chapterCount);
        groups.push(volumeSlice);
        prevCount = prevCount + chapterCount;
      }

      // Get the final, in-progress volume
      const inProgressSlice = sortedChapters.slice(prevCount);
      groups.push(inProgressSlice);

      chapterGroups = groups;
    }
  }

  async function onOpenFullConfigClicked(): Promise<void> {
    const openConfigTabIdResponse = await browser.storage.session.get(ConfigTabSettingsKey);
    const configTabId: number | undefined = openConfigTabIdResponse[ConfigTabSettingsKey];
    if (!configTabId) {
      const settingsTab = await webextBrowser.tabs.create({
        active: true,
        url: '../public/settings.html'
      });
      // TODO: make this Chrome friendly
      await browser.storage.session.set({ [ConfigTabSettingsKey]: settingsTab.id });
    } else {
      // We have a saved tab ID, let's try to set it active
      try {
        const tab = await webextBrowser.tabs.get(configTabId);
        await webextBrowser.tabs.update(tab.id, { active: true });
      } catch (e) {
        // tab not found, need to create a new one
        await webextBrowser.tabs.create({
          active: true,
          url: '../public/settings.html'
        });
      }
    }
  }
  
  async function onAutoScrollToBookmarkChange(checkbox: EventTarget & HTMLInputElement): Promise<void> {
    await settingsService.updateSettings({ autoScrollToBookmark: checkbox.checked });
  }
  
  async function onAutoScrollToBookmarkForCompletedChange(checkbox: EventTarget & HTMLInputElement): Promise<void> {
    await settingsService.updateSettings({ autoScrollToBookmarkForCompleted: checkbox.checked });
  }
</script>

<div class="config-div {inPopup ? 'popup' : ''}">
  <h2>Wandering ProgressTracker</h2>
  Welcome to Wandering ProgressTracker! {#if !enabled}Click the 'Enable' button below, then click
    'Allow' to activate the extension!{/if}
  <br />
  <div id="enabled-row">
    Status:
    {#if enabled}
      <span class="enabled">Enabled</span>
    {:else}
      <span class="disabled">Disabled</span>
    {/if}
  </div>
  <br />
  {#if !enabled}
    <button type="button" on:click={onEnabledClicked}>Enable!</button>
  {/if}
  {#if inPopup}
    {#if enabled}
      You're good to go. Feel free to close this!
    {/if}
    <br />
    <p>Want to see more settings? Open the full config page!</p>
    <button type="button" on:click={onOpenFullConfigClicked}>Open full config</button>
  {:else}
    <!-- // TODO: Add:  
  //  - Setting for whether or not to automatically scroll to bookmark on incomplete chapters
  //  - Setting for whether or not to automatically scroll to bookmark on COMPLETE chapters
  //  - Display for all chapter progress, with ability to mark each chapter as completed or not 
  //  - Button to "mark all as completed"
  //  - Button to "clear data"?
  -->
    {#await initialAppSettingsPromise}
    <p>Loading app settings...</p>
    {:then initialAppSettings}
    <div class="settings-container">
      <h3>Settings</h3>
      <div class="settings-entry">
        <input id="autoScrollCheckbox" type="checkbox" checked={initialAppSettings.autoScrollToBookmark} on:change={(x) => onAutoScrollToBookmarkChange(x.currentTarget)} />
        <!-- todo: setup binding that makes this update stored settings -->
        <label for="autoScrollCheckbox">Automatically scroll to bookmark</label>
      </div>
      <div class="settings-entry">
        <input id="autoScrollCompletedCheckbox" type="checkbox" checked={initialAppSettings.autoScrollToBookmarkForCompleted} on:change={(x) => onAutoScrollToBookmarkForCompletedChange(x.currentTarget)} />
        <label for="autoScrollCompletedCheckbox">Automatically scroll to bookmark for completed chapters</label>
      </div>
    </div>
    {/await}

    {#if enabled && chapterGroups !== null}
      <div class="progress-container">
        <h3>Chapter Completion</h3>
        {#each chapterGroups as chapterGroup, index}
          <details>
            <summary>
              <h4>Volume {index + 1}</h4>
            </summary>
            <!-- TODO: and gradient fill -->
            <div class="volume-header">
              <h5>Chapter</h5>
              <h5 class="centered">Progress</h5>
              <h5 class="centered">Complete?</h5>
            </div>
            <ol>
              {#each chapterGroup as chapter}
                <li>
                  <!-- todo: filling progress bar like on the toc -->
                  <div class="chapter-progress-border">
                    <div>{chapter.chapterName}</div>
                    <!-- todo: round off the completion percentage -->
                    <div class="percentage">{chapter.percentCompletion}%</div>
                  </div>
                  <!-- todo: handle completed check changed -->
                  <input value="{chapter.completed}" type="checkbox"/>
                </li>
              {/each}
            </ol>
          </details>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  :root {
    --accent-color: rgb(247, 167, 27);
    --accent-dark: rgb(166, 108, 6);
    --background-color: rgb(23, 28, 38);
    --foreground-color: rgb(230, 233, 239);
    --dark-foregound: var(--background-color);
  }

  :global(html) {
    font-size: 18px;
  }

  /* Used dynamically in the <html> root element if not in popup mode. */
  :global(.show-scrollbar) {
    overflow-y: scroll;
  }

  :global(body) {
    background-color: var(--background-color);
    color: var(--foreground-color);
    font-size: 1rem;
  }

  h1 {
    font-size: 2.16rem;
  }
  h2 {
    font-size: 2rem;
  }
  h3 {
    font-size: 1.86rem;
  }
  h4 {
    font-size: 1.5rem;
  }
  h5 {
    font-size: 1.1rem;
  }
  h6 {
    font-size: 1rem;
  }

  h3,
  h4,
  h5,
  h6 {
    margin: 1rem 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: 'Sudbury', 'Merriweather', serif;
    color: var(--accent-color);
  }

  button {
    background-color: var(--accent-color);
    color: var(--dark-foregound);
    margin: 0;
    border: none;
    padding: 0.8rem 1.5rem;
    cursor: pointer;
    border-radius: 5px;
    transition: background-color 0.3s ease;
    font-weight: 500;
    font-family: 'Open Sans', sans-serif;
    &:hover,
    &:focus {
      background-color: var(--accent-dark);
    }
    &:active {
      background-color: var(--accent-color);
    }
  }

  .config-div {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 40rem;
    gap: 5px;
    & h2 {
      text-align: center;
    }
    & button {
      width: 100%;
    }
    & #enabled-row {
      display: flex;
      justify-content: space-between;
      width: 100%;
    }
  }

  .config-div.popup {
    max-width: 18rem;
  }

  .enabled {
    color: green;
  }

  .disabled {
    color: red;
  }

  .settings-container {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    margin-top: 1rem;

    & .settings-entry {
      display: flex;
      flex-direction: row;
      justify-content: start;      

      & input {
        cursor: pointer;
        user-select: none;
      }

      & label {
        color: var(--accent-color);
        cursor: pointer;
        font-size: 1.1rem;
        font-family: 'Sudbury', 'Merriweather', serif;
        font-weight: 700;
        padding: 0.5rem
      }
    }
  }

  .progress-container {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    & details {
      display: inline-flex;
      & .volume-header {
        display: grid;
        grid-template-columns: 6fr 1fr 3fr;
        & h5 {
          display: inline;
        }
        & h5.centered {
          text-align: center;
        }
      }
      & ol {
        list-style-type: none;
        margin-top: 0.5rem;
        padding-left: 0;
        & li {
          display: grid;
          grid-template-columns: 7fr 3fr;
          & .chapter-progress-border {
            border: 1px solid gray;
            display: grid;
            grid-template-columns: 9fr 1fr;
          }
          & .percentage {
            text-align: right;
            justify-self: end;
          }
          & input {
            justify-self: center;
          }
        }
      }
    }
    & summary {
      cursor: pointer;
      display: inline-grid;
      grid-auto-flow: column;
      user-select: none;
      & h4 {
        margin: 0.5rem 0;
      }
    }
    & summary::after {
      align-self: center;
      justify-self: end;
      content: '>';
      transition: 0.1s;
      cursor: pointer;
    }
    & details[open] > summary::after {
      transform: rotate(90deg);
    }
  }
</style>
