<script lang="ts">
  import Browser from 'webextension-polyfill';

  const wanderingInnHostPermission = '*://wanderinginn.com/*';
  const inPopup = document.location.href.endsWith(`popup.html`);

  let enabled: boolean = false;

  Browser.permissions.contains({
    origins: [wanderingInnHostPermission]
  }).then(x => enabled = x);

  Browser.permissions.onRemoved.addListener(onPermissionRemoved);
  Browser.permissions.onAdded.addListener(onPermissionAdded);

  function onPermissionRemoved(permissions: Browser.Permissions.Permissions): void {
    if (permissions.origins?.some(x => wanderingInnHostPermission)) {
      enabled = false;
    }
  }

  function onPermissionAdded(permissions: Browser.Permissions.Permissions): void {
    if (permissions.origins?.some(x => wanderingInnHostPermission)) {
      enabled = true;
    }
  }

  async function onEnabledClicked(): Promise<void> {    
    Browser.permissions.request({
      origins: [wanderingInnHostPermission]
    });
    if (inPopup) {
      window.close();
    }
    // updated 'enabled' is handled by the event handlers up above
  }
</script>

<div class="root-div">
  <h2>Wandering ProgressTracker</h2>
  Welcome to Wandering ProgressTracker!
  Click the button below, and click 'Allow' to activate the extension!
  <br>
  <div id="enabled-row">
    Status:
    {#if enabled}
      <span class="enabled">Enabled</span>
    {:else}
      <span class="disabled">Disabled</span>
    {/if}
  </div>
  <br>
  {#if enabled}
  You're good to go. Feel free to close this {#if inPopup} popup!{:else} tab!{/if}
  {:else}
  <button type="button" on:click={onEnabledClicked}>Enable!</button>
  {/if}
</div>

<style>
  .root-div {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 350px;
    gap: 5px;
  }
  .root-div button {
    width: 100%;
  }
  .root-div #enabled-row {
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
</style>
