import browser from 'webextension-polyfill';
import { type AppSettings, DEFAULT_SETTINGS } from './models';

class SettingsService {
  private static readonly settingsKey = 'settings';
  
  public async getAppSettings(): Promise<AppSettings> {
    let settings = (
      await browser.storage.sync.get(SettingsService.settingsKey)
    )[SettingsService.settingsKey] as Partial<AppSettings> | undefined;

    if (
      !settings ||
      Object.keys(settings).length !== Object.keys(DEFAULT_SETTINGS).length
    ) {
      console.log('no settings found, using default settings');

      await browser.storage.sync.set({
        [SettingsService.settingsKey]: DEFAULT_SETTINGS
      });
      settings = DEFAULT_SETTINGS;
    }

    return settings as AppSettings;
  }

  public async updateSettings(newSettings: Partial<AppSettings>) {
    const settings = await this.getAppSettings();
    const updatedSettings = { ...settings, ...newSettings };
    await browser.storage.sync.set({
      [SettingsService.settingsKey]: updatedSettings
    });
    return updatedSettings;
  }
}

const singleton = new SettingsService();
export default singleton;
