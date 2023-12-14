<script lang="ts">
  import webextBrowser from 'webextension-polyfill';
  import { ConfigTabSettingsKey } from '../background';
  import { wptLog } from '../shared/logging';

  const wanderingInnHostPermission = '*://wanderinginn.com/*';
  const inPopup = document.location.href.endsWith(`popup.html`);

  let enabled: boolean = false;

  webextBrowser.permissions
    .contains({
      origins: [wanderingInnHostPermission]
    })
    .then(x => (enabled = x));

  webextBrowser.permissions.onRemoved.addListener(onPermissionRemoved);
  webextBrowser.permissions.onAdded.addListener(onPermissionAdded);

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
  Welcome to Wandering ProgressTracker! Click the button below, and click 'Allow' to activate the extension!
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
  {#if enabled}
    You're good to go. Feel free to close this {#if inPopup} popup!{:else} tab!{/if}
  {:else}
    <button type="button" on:click={onEnabledClicked}>Enable!</button>
  {/if}
  {#if inPopup}
    <br />
    <p>Want to see more settings? Open the full config page!</p>
    <button type="button" on:click={onOpenFullConfigClicked}>Open full config</button>
  {:else}
    <!-- // TODO: Add:
  //  - Setting for whether or not to hide the winter solstice theme
  //  - Setting for whether or not to automatically scroll to bookmark on incomplete chapters
  //  - Setting for whether or not to automatically scroll to bookmark on COMPLETE chapters (would require bringing back the 'completed' flag)
  //  - Display for all chapter progress, with ability to mark each chapter as completed or not -->
    <div class="settings-container">
      <h3>Settings</h3>
      <div class="settings-entry">
        <input type="checkbox"/>
        <h5>Hide backgrounds</h5>
      </div>
      <div class="settings-entry">
        <input type="checkbox"/>
        <h5>Automatically scroll to bookmark</h5>
      </div>
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

  :global(body) {
    background-color: var(--background-color);
    color: var(--foreground-color);
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

    & .settings-entry {
      display: flex;
      flex-direction: row;
      justify-content: start;
      gap: 0.5rem;
    }
  }
</style>
