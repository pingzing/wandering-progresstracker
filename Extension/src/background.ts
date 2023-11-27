import { runtime, tabs, type Runtime } from 'webextension-polyfill';
import { detect } from 'detect-browser';
import {
  type BrowserMessage,
  type BrowserMessageType,
  type ColorScheme
} from './models';
import settingsService from './settingsService';

runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    tabs.create({
      url: '../public/onboarding.html'
    })
  } else { // browser_update or update
    // TODO: Probably nothing.
  }
})

runtime.onMessage.addListener(onMessage);

function onMessage(message: any, sender: Runtime.MessageSender, sendResponse: (x?: any) => void): true | void | Promise<any> {
  console.log('got message', message);
  switch (message.type as BrowserMessageType) {
    case 'gotColorScheme': {
      updateIcon(message.value as ColorScheme).then(sendResponse);
      return true;
    }
    case 'requestToc': {
      getToc().then(tocHtml => {
        sendResponse(tocHtml);
      })
      return true;
    }
  }
}

async function updateIcon(colorScheme: ColorScheme) {
  console.log('updating icon', colorScheme);
  // do work here
}

async function getToc(): Promise<string | null> {
  const tocResponse = await fetch("https://wanderinginn.com/table-of-contents/");
  if (!tocResponse.ok) {
    console.log("Failed to fetch toc.");
    return null;
  }  
  
  return await tocResponse.text();
}
