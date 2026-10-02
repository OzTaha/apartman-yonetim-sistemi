import { test as base, type BrowserContext } from '@playwright/test';

export * from '@playwright/test';

type PatchedStorage = Storage & { originalGetItem?: Storage['getItem'] };

function skipTours() {
  const proto = Storage.prototype as PatchedStorage;
  if (proto.originalGetItem) return;
  proto.originalGetItem = proto.getItem;
  proto.getItem = function (key: string) {
    if (key.startsWith('apartman.tours.')) return '["*"]';
    return proto.originalGetItem!.call(this, key);
  };
}

function showTours() {
  const proto = Storage.prototype as PatchedStorage;
  if (proto.originalGetItem) proto.getItem = proto.originalGetItem;
}

async function prepare(context: BrowserContext) {
  await context.addInitScript(skipTours);
  return context;
}

export const test = base.extend<{ showTours: boolean }>({
  showTours: [false, { option: true }],
  context: async ({ context, showTours: show }, provide) => {
    await context.addInitScript(show ? showTours : skipTours);
    await provide(context);
  },
  browser: async ({ browser }, provide) => {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (options) => prepare(await newContext(options));
    await provide(browser);
  },
});
