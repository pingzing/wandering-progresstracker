<script lang="ts">
  import Browser from "webextension-polyfill";    

    async function onEnabledClicked(): Promise<void> {
        const given: boolean = await Browser.permissions.request({
            origins: ["*://wanderinginn.com/*"]
        })
        if (!given) {
            // display sadness
        } else {
            // display happiness, close tab
        }
    }
</script>

<div>
    hi, I'm the root div
    <button 
    type="button"
    on:click={onEnabledClicked}>Enable stuff</button>
</div>

<style>

</style>