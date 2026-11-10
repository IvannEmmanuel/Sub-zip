import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Sub PiP',
  version: '0.2.1',
  description: 'Keep subtitles visible in Picture-in-Picture. Works with YouTube, HTML5 <track>, page captions and SRT/VTT files.',
  minimum_chrome_version: '116',
  icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
  action: {
    default_title: 'Sub PiP',
    default_popup: 'src/popup/index.html',
    default_icon: { '16': 'icons/icon16.png', '48': 'icons/icon48.png' },
  },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      all_frames: true,
      match_about_blank: true,
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  commands: {
    'toggle-pip': {
      suggested_key: { default: 'Alt+P' },
      description: 'Toggle Picture-in-Picture with subtitles',
    },
  },
});
