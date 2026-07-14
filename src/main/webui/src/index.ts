import { loadSite, registerPanel } from '@casehubio/pages-runtime';
import { hostPanel } from '@casehubio/pages-ui';
import { getValidToken } from './auth.js';
import './identity-widget.js';
import './workbench/qhorus-workbench.js';

registerPanel('chat-workbench', 'qhorus-workbench');

const app = hostPanel('chat-workbench', {
  endpoint: '/ws/chat',
  restBase: '/api',
  identities: 'alice,bob,charlie,agent-alpha,agent-beta,agent-gamma',
});

function bootApp() {
  const container = document.getElementById('app');
  if (!container) return;
  loadSite(container, app).then(site => site.setTheme('dark'));
}

document.addEventListener('pages-auth-success', bootApp);

if (getValidToken()) {
  bootApp();
}
