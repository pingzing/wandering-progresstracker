<script lang="ts">
  import webextBrowser from 'webextension-polyfill';
  import { ConfigTabSettingsKey } from '../background';
  import { wptLog } from '../shared/logging';
  import { type StoryUrl, type BrowserMessage, type UserChapterInfo } from '../shared/models';
  import * as serialization from '../shared/serialization';
  import { VolumeChapterCounts } from '../shared/consts';

// main: (runs on load)

  const wanderingInnHostPermission = '*://wanderinginn.com/*';
  const inPopup = document.location.href.endsWith(`popup.html`);

  // Tracks whether or not the extension has origins permission for the wandering inn hostname
  // i.e. whether or the the extension is actually enabled or not
  let enabled: boolean = false;
  
  // Set up initial value of 'enabled' and listeners for host permissions changing
  webextBrowser.permissions
    .contains({
      origins: [wanderingInnHostPermission]
    })
    .then(x => (enabled = x));

  webextBrowser.permissions.onRemoved.addListener(onPermissionRemoved);
  webextBrowser.permissions.onAdded.addListener(onPermissionAdded);

  // Get user's progress from storage, if they have any  
  const chapterGroupsPromise = webextBrowser.runtime.sendMessage(<BrowserMessage>{
    type: 'getChapters'
  }).then( (x: string) => {
    const unsortedChapters = serialization.stringToMap<StoryUrl, UserChapterInfo>(x);
    const sortedChapters = Array.from(unsortedChapters).sort( (a,b) => a[1].chapterIndex - b[1].chapterIndex).map(x => x[1]);
    // Group chapters by volume
    let chapterGroups: UserChapterInfo[][] = [];
    let prevCount = 0;
    for (const chapterCount of VolumeChapterCounts) {
      const volumeSlice = sortedChapters.slice(prevCount, prevCount + chapterCount);
      chapterGroups.push(volumeSlice);
      prevCount = prevCount + chapterCount;
    }

    // Get the final, in-progress volume
    const inProgressSlice = sortedChapters.slice(prevCount);
    chapterGroups.push(inProgressSlice);

    return chapterGroups;
  });

  // End main

  function onPermissionRemoved(permissions: webextBrowser.Permissions.Permissions): void {
    if (permissions.origins?.some(x => wanderingInnHostPermission)) {
      enabled = false;
    }
  }

  function onPermissionAdded(permissions: webextBrowser.Permissions.Permissions): void {
    if (permissions.origins?.some(x => wanderingInnHostPermission)) {
      enabled = true;
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
</script>

<div class="config-div {inPopup ? 'popup' : ''}">
  <h2>Wandering ProgressTracker</h2>
  Welcome to Wandering ProgressTracker! {#if !enabled}Click the 'Enable' button below, then click 'Allow' to activate the extension!{/if}
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
  //  - Setting for whether or not to automatically scroll to bookmark on COMPLETE chapters (would require bringing back the 'completed' flag)
  //  - Display for all chapter progress, with ability to mark each chapter as completed or not 
  //  - Button to "mark all as completed"
  //  - Button to "clear data"?
  -->
    <div class="settings-container">
      <h3>Settings</h3>
      <div class="settings-entry">
        <input type="checkbox"/>
        <!-- todo: setup binding that makes this update stored settings -->
        <h5>Automatically scroll to bookmark</h5>
      </div>
    </div>

    <div class="progress-container">
      <h3>Chapter Completion</h3>
      <!-- Some kind of column header? Sticky? -->
      {#await chapterGroupsPromise}
        {:then chapterGroups}
        {#each chapterGroups as chapterGroup, index}
          <h4>Volume {index + 1}</h4> <!-- TODO: Expando collapso button, and overall progress percent, and gradient fill -->
          <ol>
          {#each chapterGroup as chapter}          
            <li>              
              <!-- todo: filling progress bar like on the toc -->
              <!-- also todo: mark completed button (if we're bringing back 'completed' as a concept)
              (or maybe that just forces completiong percent to 100?) -->
              {chapter.chapterName}: {chapter.percentCompletion}%
            </li>      
          {/each}
          </ol>
        {/each}
      {/await}
    </div>
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

  :global(body) {
    background-color: var(--background-color);
    color: var(--foreground-color);
    font-size: 1rem;
  }

  h1 { font-size: 2.16rem; }
  h2 { font-size: 2rem; }
  h3 { font-size: 1.86rem; }
  h4 { font-size: 1.5rem; }
  h5 { font-size: 1.1rem; }
  h6 { font-size: 1rem; }

  h3, h4, h5, h6 {
    margin: 1rem 0;
  }

  ol {
    /* list-style-type: none; */
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
  }

  .config-div.popup {
    max-width: 18rem;
  }

  .config-div button {
    width: 100%;
  }

  .config-div #enabled-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
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
      gap: 0.5rem;

      & h5 {
        margin: 0; /*Already handled by gap above*/
      }
    }
  }
</style>
