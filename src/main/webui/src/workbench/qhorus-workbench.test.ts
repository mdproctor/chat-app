import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MQ_DESKTOP } from './responsive.js';

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === MQ_DESKTOP,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

import type { QhorusMessage, ChannelMember, Reaction } from '@casehubio/blocks-ui-channel-activity';
import { ChannelEventTopics } from '@casehubio/blocks-ui-channel-activity';

const _origDefine = customElements.define.bind(customElements);
customElements.define = ((name: string, ctor: CustomElementConstructor, opts?: ElementDefinitionOptions) => {
  if (!customElements.get(name)) _origDefine(name, ctor, opts);
}) as typeof customElements.define;

await import('./qhorus-workbench.js');

vi.mock('../auth.js', () => ({
  getToken: () => 'mock-token',
  getValidToken: () => 'mock-token',
  getIdentity: () => 'test-user',
  authenticatedFetch: vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(new Response('{}', { status: 200 }))
  ),
}));

async function renderWorkbench(props: Record<string, unknown> = {}): Promise<HTMLElement> {
  const el = document.createElement('qhorus-workbench') as any;
  if (props.endpoint) el.endpoint = props.endpoint;
  if (props.restBase) el.restBase = props.restBase;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('QhorusWorkbenchElement', () => {
  let element: any;

  beforeEach(async () => {
    element = await renderWorkbench();
  });

  it('renders all three panels', () => {
    const shadow = element.shadowRoot!;
    expect(shadow.querySelector('.nav-panel')).toBeTruthy();
    expect(shadow.querySelector('.main-panel')).toBeTruthy();
    expect(shadow.querySelector('.member-panel')).toBeTruthy();
  });

  it('renders channel nav component', () => {
    const shadow = element.shadowRoot!;
    const nav = shadow.querySelector('blocks-channel-nav');
    expect(nav).toBeTruthy();
  });

  it('renders channel feed component', () => {
    const shadow = element.shadowRoot!;
    const feed = shadow.querySelector('blocks-channel-feed');
    expect(feed).toBeTruthy();
  });

  it('renders message input component', () => {
    const shadow = element.shadowRoot!;
    const input = shadow.querySelector('blocks-channel-input');
    expect(input).toBeTruthy();
  });

  it('renders member panel component', () => {
    const shadow = element.shadowRoot!;
    const panel = shadow.querySelector('blocks-channel-member-panel');
    expect(panel).toBeTruthy();
  });

  it('updates selected channel on SELECT_CHANNEL event', async () => {
    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.SELECT_CHANNEL,
        payload: { channelId: 'ch-1' },
      },
      bubbles: true,
      composed: true,
    });

    element.dispatchEvent(event);
    await element.updateComplete;

    expect(element._channels.selectedChannelId).toBe('ch-1');
  });

  it('filters messages by selected channel via controller', async () => {
    element._push.applyOp({
      op: 'snapshot', dataset: 'messages',
      rows: [
        ['ch-1', 'msg-1', null, 'alice', 'Hello', '2026-07-07T12:00:00Z', 'EVENT', 'HUMAN', '', null, '[]', null],
        ['ch-2', 'msg-2', null, 'bob', 'Hi', '2026-07-07T12:01:00Z', 'EVENT', 'HUMAN', '', null, '[]', null],
      ],
    });
    element._channels.selectedChannelId = 'ch-1';
    element.requestUpdate();
    await element.updateComplete;

    const feed = element.shadowRoot!.querySelector('blocks-channel-feed');
    const messages = feed.messages as QhorusMessage[];
    expect(messages.length).toBe(1);
    expect(messages[0].channelId).toBe('ch-1');
  });

  it('filters members by selected channel via controller', async () => {
    element._push.applyOp({
      op: 'snapshot', dataset: 'members',
      rows: [
        ['m-1', 'ch-1', 'alice', 'Alice'],
        ['m-2', 'ch-2', 'bob', 'Bob'],
      ],
    });
    element._channels.selectedChannelId = 'ch-1';
    element.requestUpdate();
    await element.updateComplete;

    const panel = element.shadowRoot!.querySelector('blocks-channel-member-panel');
    const members = panel.members as ChannelMember[];
    expect(members.length).toBe(1);
    expect(members[0].channelId).toBe('ch-1');
  });

  it('sets replyTo on MESSAGE_SELECTED event', async () => {
    const message: QhorusMessage = {
      id: 'msg-1',
      channelId: 'ch-1',
      sender: 'alice',
      messageType: 'EVENT',
      actorType: 'HUMAN',
      content: 'Hello',
      topic: 'General',
      replyCount: 0,
      artefactRefs: [],
      createdAt: '2026-07-07T12:00:00Z',
    };

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.MESSAGE_SELECTED,
        payload: { message },
      },
      bubbles: true,
      composed: true,
    });

    element.dispatchEvent(event);
    await element.updateComplete;

    expect(element._messaging.replyTo).toEqual({
      messageId: 'msg-1',
      senderName: 'alice',
    });
  });

  it('reply to a thread reply targets the thread root, not the reply', async () => {
    const replyMessage: QhorusMessage = {
      id: 'reply-1',
      channelId: 'ch-1',
      sender: 'bob',
      messageType: 'EVENT',
      actorType: 'HUMAN',
      content: 'A reply',
      topic: 'General',
      inReplyTo: 'root-msg-1',
      replyCount: 0,
      artefactRefs: [],
      createdAt: '2026-07-07T12:01:00Z',
    };

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.MESSAGE_SELECTED,
        payload: { message: replyMessage },
      },
      bubbles: true,
      composed: true,
    });

    element.dispatchEvent(event);
    await element.updateComplete;

    expect(element._messaging.replyTo).toEqual({
      messageId: 'root-msg-1',
      senderName: 'bob',
    });
  });

  it('auto-selects first channel when channels arrive and none selected', async () => {
    expect(element._channels.selectedChannelId).toBe('');

    element._push.applyOp({
      op: 'snapshot', dataset: 'channels',
      rows: [
        ['ch-1', 'general', '', '', 'false'],
        ['ch-2', 'incidents', '', '', 'false'],
      ],
    });
    await element.updateComplete;

    expect(element._channels.selectedChannelId).toBe('ch-1');
  });

  it('does not override selected channel when channels update', async () => {
    element._channels.selectedChannelId = 'ch-2';
    element._push.applyOp({
      op: 'snapshot', dataset: 'channels',
      rows: [
        ['ch-1', 'general', '', '', 'false'],
        ['ch-2', 'incidents', '', '', 'false'],
      ],
    });
    await element.updateComplete;

    expect(element._channels.selectedChannelId).toBe('ch-2');
  });

  it('calls authenticatedFetch on SEND_MESSAGE event with /api/chat path', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();

    element._channels.selectedChannelId = 'ch-1';

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.SEND_MESSAGE,
        payload: { channelId: 'ch-1', content: 'Test message' },
      },
      bubbles: true,
      composed: true,
    });

    element.dispatchEvent(event);
    await element.updateComplete;

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/ch-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'Test message' }),
      })
    );
  });

  it('calls authenticatedFetch on CREATE_CHANNEL event via controller', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.CREATE_CHANNEL,
        payload: { name: 'new-channel' },
      },
      bubbles: true,
      composed: true,
    });

    element.dispatchEvent(event);
    await element.updateComplete;

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/channels',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'new-channel' }),
      })
    );
  });

  it('calls authenticatedFetch on DELETE_CHANNEL event via controller', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.DELETE_CHANNEL,
        payload: { channelId: 'ch-1' },
      },
      bubbles: true,
      composed: true,
    });

    element.dispatchEvent(event);
    await element.updateComplete;

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/channels/ch-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  describe('push connection', () => {
    let OriginalWebSocket: typeof WebSocket;
    let mockWsInstances: any[];

    beforeEach(() => {
      OriginalWebSocket = globalThis.WebSocket;
      mockWsInstances = [];
      (globalThis as any).WebSocket = class MockWebSocket {
        url: string;
        onopen: ((e: any) => void) | null = null;
        onmessage: ((e: any) => void) | null = null;
        onclose: ((e: any) => void) | null = null;
        onerror: ((e: any) => void) | null = null;
        readyState = 1;
        close = vi.fn();
        send = vi.fn();
        constructor(url: string) {
          this.url = url;
          mockWsInstances.push(this);
        }
      };
    });

    afterEach(() => {
      globalThis.WebSocket = OriginalWebSocket;
    });

    it('creates WebSocket to /ws/push with token', async () => {
      const el = document.createElement('qhorus-workbench') as any;
      el.endpoint = '/ws/push';
      document.body.appendChild(el);
      await el.updateComplete;

      expect(mockWsInstances.length).toBeGreaterThanOrEqual(1);
      const ws = mockWsInstances[mockWsInstances.length - 1];
      expect(ws.url).toContain('/ws/push');
      expect(ws.url).toContain('token=mock-token');
    });
  });

  describe('REST error handling', () => {
    it('catches _sendMessage network error without unhandled rejection', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      element._channels.selectedChannelId = 'ch-1';
      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.SEND_MESSAGE,
          payload: { channelId: 'ch-1', content: 'Test' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(errorSpy).toHaveBeenCalledWith('Failed to send message:', expect.any(Error));
      errorSpy.mockRestore();
    });

    it('catches _createChannel error and shows error banner', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.CREATE_CHANNEL,
          payload: { name: 'fail-channel' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(element._errorMessage).toContain('Failed to create channel');
    });

    it('catches _deleteChannel error and shows error banner', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.DELETE_CHANNEL,
          payload: { channelId: 'ch-1' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(element._errorMessage).toContain('Failed to delete channel');
    });
  });

  describe('space CRUD operations', () => {
    it('CREATE_SPACE triggers POST /api/spaces and addPendingSpace', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sp-1', name: 'New Space' }), { status: 200 }));

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.CREATE_SPACE,
          payload: { name: 'New Space' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/spaces',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Space' }),
        })
      );
    });

    it('RENAME_SPACE triggers PUT /api/spaces/{id}', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockClear();

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.RENAME_SPACE,
          payload: { spaceId: 'sp-1', newName: 'Renamed' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/spaces/sp-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Renamed' }),
        })
      );
    });

    it('DELETE_SPACE triggers DELETE /api/spaces/{id}?reassign=true', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockClear();

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.DELETE_SPACE,
          payload: { spaceId: 'sp-1' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/spaces/sp-1?reassign=true',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('MOVE_CHANNEL_TO_SPACE triggers PUT /api/channels/{id}/space', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockClear();

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.MOVE_CHANNEL_TO_SPACE,
          payload: { channelId: 'ch-1', spaceId: 'sp-2' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/channels/ch-1/space',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ spaceId: 'sp-2' }),
        })
      );
    });

    it('CREATE_CHANNEL with spaceId includes spaceId in POST body', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockClear();

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.CREATE_CHANNEL,
          payload: { name: 'in-space', spaceId: 'sp-1' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/channels',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'in-space', spaceId: 'sp-1' }),
        })
      );
    });

    it('failed space operation sets _errorMessage', async () => {
      const { authenticatedFetch } = await import('../auth.js');
      const fetchMock = vi.mocked(authenticatedFetch);
      fetchMock.mockRejectedValueOnce(new Error('Server down'));

      const event = new CustomEvent('pages-event', {
        detail: {
          topic: ChannelEventTopics.CREATE_SPACE,
          payload: { name: 'fail-space' },
        },
        bubbles: true, composed: true,
      });
      element.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(element._errorMessage).toContain('Failed to create space');
    });

    it('error banner renders when _errorMessage is set', async () => {
      element._errorMessage = 'Test error';
      await element.updateComplete;

      const banner = element.shadowRoot!.querySelector('.error-banner');
      expect(banner).toBeTruthy();
      expect(banner!.textContent).toContain('Test error');
    });

    it('error banner does not render when _errorMessage is empty', async () => {
      element._errorMessage = '';
      await element.updateComplete;

      const banner = element.shadowRoot!.querySelector('.error-banner');
      expect(banner).toBeFalsy();
    });
  });

  it('routes REACT event to authenticatedFetch via ReactionController', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();

    element._push.applyOp({
      op: 'snapshot', dataset: 'messages',
      rows: [['ch-1', 'msg-1', null, 'alice', 'Hello', '2026-07-07T12:00:00Z', 'EVENT', 'HUMAN', '', null, '[]', null]],
    });

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.REACT,
        payload: { messageId: 'msg-1', emoji: '👍' },
      },
      bubbles: true, composed: true,
    });
    element.dispatchEvent(event);

    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/channels/ch-1/messages/msg-1/reactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ emoji: '👍' }),
      })
    );
  });

  it('routes UNREACT event to authenticatedFetch via ReactionController', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();

    element._push.applyOp({
      op: 'snapshot', dataset: 'messages',
      rows: [['ch-1', 'msg-1', null, 'alice', 'Hello', '2026-07-07T12:00:00Z', 'EVENT', 'HUMAN', '', null, '[]', null]],
    });

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.UNREACT,
        payload: { messageId: 'msg-1', emoji: '👍' },
      },
      bubbles: true, composed: true,
    });
    element.dispatchEvent(event);

    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/channels/ch-1/messages/msg-1/reactions/%F0%9F%91%8D',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('constructs reply URL with /api/chat path', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.SEND_MESSAGE,
        payload: { channelId: 'ch-1', content: 'Reply text', inReplyTo: 'msg-parent' },
      },
      bubbles: true, composed: true,
    });
    element.dispatchEvent(event);

    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/ch-1/messages/msg-parent/replies',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('filters reactions to only those belonging to selected channel messages', async () => {
    element._push.applyOp({
      op: 'snapshot', dataset: 'messages',
      rows: [
        ['ch-1', 'msg-1', null, 'alice', 'Hello', '2026-07-07T12:00:00Z', 'EVENT', 'HUMAN', '', null, '[]', null],
        ['ch-2', 'msg-2', null, 'bob', 'Hi', '2026-07-07T12:01:00Z', 'EVENT', 'HUMAN', '', null, '[]', null],
      ],
    });
    element._push.applyOp({
      op: 'snapshot', dataset: 'reactions',
      rows: [['msg-1', '👍'], ['msg-2', '❤️']],
    });
    element._channels.selectedChannelId = 'ch-1';
    element.requestUpdate();
    await element.updateComplete;

    const feed = element.shadowRoot!.querySelector('blocks-channel-feed');
    const reactions = feed.reactions as Reaction[];
    expect(reactions.length).toBe(1);
    expect(reactions[0].messageId).toBe('msg-1');
    expect(reactions[0].emoji).toBe('👍');
  });

  it('clears replyTo after successful send', async () => {
    const { authenticatedFetch } = await import('../auth.js');
    const fetchMock = vi.mocked(authenticatedFetch);
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    element._messaging.replyTo = { messageId: 'msg-1', senderName: 'alice' };

    const event = new CustomEvent('pages-event', {
      detail: {
        topic: ChannelEventTopics.SEND_MESSAGE,
        payload: { channelId: 'ch-1', content: 'Reply' },
      },
      bubbles: true, composed: true,
    });
    element.dispatchEvent(event);

    await new Promise(r => setTimeout(r, 0));
    expect(element._messaging.replyTo).toBeUndefined();
  });

  it('cleans up EventConnection on disconnectedCallback', async () => {
    let OriginalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = class MockWebSocket {
      url: string;
      onopen: ((e: any) => void) | null = null;
      onmessage: ((e: any) => void) | null = null;
      onclose: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      readyState = 1;
      close = vi.fn();
      send = vi.fn();
      constructor(url: string) { this.url = url; }
    };

    const el = document.createElement('qhorus-workbench') as any;
    el.endpoint = '/ws/push';
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el._eventConn).toBeDefined();
    el.remove();
    globalThis.WebSocket = OriginalWebSocket;
  });

  describe('theme toggle', () => {
    it('starts in light mode with pages-theme-casehub-light class', async () => {
      const el = await renderWorkbench();
      await el.updateComplete;
      expect(el.classList.contains('pages-theme-casehub-light')).toBe(true);
      expect(el.classList.contains('pages-theme-casehub-dark')).toBe(false);
    });

    it('toggles to dark mode', async () => {
      const el = await renderWorkbench() as any;
      el._toggleTheme();
      await el.updateComplete;
      expect(el.classList.contains('pages-theme-casehub-dark')).toBe(true);
      expect(el.classList.contains('pages-theme-casehub-light')).toBe(false);
      expect(el._darkMode).toBe(true);
    });

    it('toggles back to light mode', async () => {
      const el = await renderWorkbench() as any;
      el._toggleTheme();
      el._toggleTheme();
      await el.updateComplete;
      expect(el.classList.contains('pages-theme-casehub-light')).toBe(true);
      expect(el._darkMode).toBe(false);
    });

    it('renders theme toggle button in dock strip', async () => {
      const el = await renderWorkbench();
      const toggle = el.shadowRoot!.querySelector('.dock-strip .dock-btn:last-child');
      expect(toggle).toBeTruthy();
      expect(toggle!.getAttribute('title')).toBe('Dark mode');
    });
  });

  describe('layout persistence', () => {
    it('initializes dock state from DockItem defaults', async () => {
      const el = await renderWorkbench() as any;
      expect(el._layoutState.docks.nav).toBe(true);
      expect(el._layoutState.docks.members).toBe(true);
      expect(el._layoutState.docks.tasks).toBe(false);
      expect(el._layoutState.docks.correlation).toBe(false);
      expect(el._layoutState.docks.artifacts).toBe(false);
    });

    it('toggleDock updates layoutState.docks', async () => {
      const el = await renderWorkbench() as any;
      expect(el._layoutState.docks.tasks).toBe(false);
      el._toggleDock('tasks');
      expect(el._layoutState.docks.tasks).toBe(true);
      el._toggleDock('tasks');
      expect(el._layoutState.docks.tasks).toBe(false);
    });

    it('saves layout state via layoutStore on toggle', async () => {
      const el = await renderWorkbench() as any;
      const saved: any[] = [];
      el._layoutStore = { load: async () => null, save: async (_k: string, s: any) => { saved.push(s); }, delete: async () => {} };
      el._toggleDock('tasks');
      expect(saved.length).toBe(1);
      expect(saved[0].docks.tasks).toBe(true);
    });

    it('restores layout state from layoutStore on connect', async () => {
      const state = { splits: {}, docks: { nav: false, members: true, tasks: true, correlation: false, artifacts: false }, panels: {} };
      const el = await renderWorkbench() as any;
      el._layoutStore = { load: async () => state, save: async () => {}, delete: async () => {} };
      await el._loadLayout();
      expect(el._layoutState.docks.nav).toBe(false);
      expect(el._layoutState.docks.tasks).toBe(true);
    });
  });

  describe('layout structure', () => {
    it('blocks-channel-feed fills available space in main panel', async () => {
      const el = await renderWorkbench();
      const styles = (el.constructor as any).styles;
      const cssText = Array.isArray(styles) ? styles.map((s: any) => s.cssText).join('\n') : styles.cssText;
      expect(cssText).toContain('blocks-channel-feed');
      expect(cssText).toMatch(/blocks-channel-feed[^}]*flex:\s*1/);
      expect(cssText).toMatch(/blocks-channel-feed[^}]*min-height:\s*0/);
    });

    it('message-input is pinned to bottom', async () => {
      const el = await renderWorkbench();
      const styles = (el.constructor as any).styles;
      const cssText = Array.isArray(styles) ? styles.map((s: any) => s.cssText).join('\n') : styles.cssText;
      expect(cssText).toContain('blocks-channel-input');
      expect(cssText).toMatch(/blocks-channel-input[^}]*flex-shrink:\s*0/);
    });
  });

  it('passes renderContent callback to blocks-channel-feed for commitment range bars', async () => {
    element._push.applyOp({
      op: 'snapshot', dataset: 'messages',
      rows: [['ch-1', 'msg-1', null, 'alice', 'Do this', '2026-01-01T00:00:00Z', 'COMMAND', 'AGENT', '', 'corr-1', '[]', 'bob']],
    });
    element._push.applyOp({
      op: 'snapshot', dataset: 'commitments',
      rows: [['corr-1', 'ch-1', 'OPEN', '2026-02-01T00:00:00Z', '', '', '2026-01-01T00:00:00Z']],
    });
    element._channels.selectedChannelId = 'ch-1';
    element.requestUpdate();
    await element.updateComplete;

    const feed = element.shadowRoot!.querySelector('blocks-channel-feed');
    expect(feed.renderContent).toBeTypeOf('function');
  });

  describe('swipe gestures', () => {
    it('has SwipeController attached', async () => {
      const el = await renderWorkbench() as any;
      expect(el._swipeController).toBeDefined();
    });
  });

  describe('phone layout', () => {
    beforeEach(() => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }) as MediaQueryList);
    });

    afterEach(() => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === MQ_DESKTOP,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }) as MediaQueryList);
    });

    it('phone header buttons have aria-labels', async () => {
      const el = await renderWorkbench() as any;
      const buttons = el.shadowRoot!.querySelectorAll('.phone-header .dock-btn');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      const channelsBtn = buttons[0] as HTMLElement;
      const membersBtn = buttons[1] as HTMLElement;
      expect(channelsBtn.getAttribute('aria-label')).toBe('Channels');
      expect(membersBtn.getAttribute('aria-label')).toBe('Members');
    });

    it('members button opens right-side drawer', async () => {
      const el = await renderWorkbench() as any;
      const buttons = el.shadowRoot!.querySelectorAll('.phone-header .dock-btn');
      const membersBtn = buttons[1] as HTMLElement;
      membersBtn.click();
      await el.updateComplete;

      expect(el._drawerOpen).toBe('members');
      const rightDrawer = el.shadowRoot!.querySelector('.drawer.right') as HTMLElement;
      expect(rightDrawer).toBeTruthy();
      expect(rightDrawer.classList.contains('open')).toBe(true);
    });

    it('main panel is inert when drawer is open', async () => {
      const el = await renderWorkbench() as any;
      const buttons = el.shadowRoot!.querySelectorAll('.phone-header .dock-btn');
      (buttons[1] as HTMLElement).click();
      await el.updateComplete;

      const mainPanel = el.shadowRoot!.querySelector('.main-panel') as HTMLElement;
      expect(mainPanel.getAttribute('inert')).not.toBeNull();
    });
  });
});
