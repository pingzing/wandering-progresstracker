<script lang="ts">
  import { tabs } from 'webextension-polyfill';
  import type { BrowserMessage } from '../models';

  // This is shared for both the popup and the settings page

  async function shareAllClicked(): Promise<void> {
    const tab = (await tabs.query({ active: true, currentWindow: true }))[0];

    tabs.sendMessage(tab.id!, <BrowserMessage>{
      type: 'serializeAllToUrl'
    });
  }

  async function shareChapterClicked(): Promise<void> {
    const tab = (await tabs.query({ active: true, currentWindow: true }))[0];

    tabs.sendMessage(tab.id!, <BrowserMessage>{
      type: 'serializeChapterToUrl'
    });
  }
</script>

<div>
  <h1>Wandering ProgressTracker</h1>
  <button type="button" on:click={shareAllClicked}>Serialize all to URL</button>
  <button type="button" on:click={shareChapterClicked}
    >Serialize current chapter to URL</button
  >
</div>

<style>
  div {
    display: flex;
    justify-content: center;
  }
</style>
