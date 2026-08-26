import { describe, it, expect } from 'vitest';
import { ChannelStateController } from './channel-state-controller.js';
import { PushController } from './push-controller.js';
import type { DatasetOp } from './push-controller.js';
import { ChannelEventTopics } from './events.js';

class MockHost {
  controllers: any[] = [];
  updateCount = 0;
  addController(c: any) { this.controllers.push(c); }
  removeController() {}
  requestUpdate() { this.updateCount++; }
  get updateComplete() { return Promise.resolve(true); }
}

function createPair() {
  const host = new MockHost();
  const push = new PushController(host as any);
  const ctrl = new ChannelStateController(host as any, push);
  return { host, push, ctrl };
}

function channelRow(id: string, name: string, opts?: {
  description?: string; spaceId?: string; spaceName?: string; parentSpaceId?: string;
  unreadCount?: string;
}): unknown[] {
  return [
    id, name, '', opts?.description ?? '', 'false',
    opts?.spaceId ?? '', opts?.spaceName ?? '', opts?.parentSpaceId ?? '',
    opts?.unreadCount ?? '',
  ];
}

function messageRow(channelId: string, messageId: string, opts?: {
  parentId?: string; sender?: string; text?: string; timestamp?: string;
  messageType?: string; actorType?: string; topicId?: string;
  correlationId?: string; artefactRefs?: string; target?: string;
}): unknown[] {
  return [
    channelId, messageId, opts?.parentId ?? '', opts?.sender ?? 'alice',
    opts?.text ?? 'hello', opts?.timestamp ?? '2026-01-01T00:00:00Z',
    opts?.messageType ?? 'EVENT', opts?.actorType ?? 'HUMAN',
    opts?.topicId ?? '', opts?.correlationId ?? '',
    opts?.artefactRefs ?? '[]', opts?.target ?? '',
  ];
}

function topicRow(topicId: string, channelId: string, name: string, opts?: {
  state?: string; messageCount?: string; latestActivityTs?: string; createdAt?: string;
}): unknown[] {
  return [
    topicId, channelId, name, opts?.state ?? 'ACTIVE',
    opts?.messageCount ?? '0', opts?.latestActivityTs ?? '',
    opts?.createdAt ?? '2026-01-01T00:00:00Z',
  ];
}

function spaceRow(id: string, name: string, opts?: {
  description?: string; parentSpaceId?: string;
}): unknown[] {
  return [id, name, opts?.description ?? '', opts?.parentSpaceId ?? ''];
}

describe('ChannelStateController', () => {
  describe('channel ops', () => {
    it('applies channel snapshot and maps to QhorusChannel', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { description: 'Main channel' })],
      });
      expect(ctrl.channels).toHaveLength(1);
      expect(ctrl.channels[0]!.id).toBe('ch-1');
      expect(ctrl.channels[0]!.name).toBe('general');
      expect(ctrl.channels[0]!.description).toBe('Main channel');
      expect(ctrl.channels[0]!.semantic).toBe('APPEND');
      expect(ctrl.channels[0]!.paused).toBe(false);
    });

    it('maps space fields from channel row', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', {
          spaceId: 'sp-1', spaceName: 'Project Alpha', parentSpaceId: 'sp-root',
        })],
      });
      expect(ctrl.channels[0]!.spaceId).toBe('sp-1');
      expect(ctrl.channels[0]!.spaceName).toBe('Project Alpha');
      expect(ctrl.channels[0]!.parentSpaceId).toBe('sp-root');
    });

    it('parses unread count from row position 8', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { unreadCount: '7' })],
      });
      expect(ctrl.channels[0]!.unreadCount).toBe(7);
    });

    it('defaults unread count to 0 when absent', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general')],
      });
      expect(ctrl.channels[0]!.unreadCount).toBe(0);
    });

    it('treats empty space fields as undefined', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general')],
      });
      expect(ctrl.channels[0]!.spaceId).toBeUndefined();
      expect(ctrl.channels[0]!.spaceName).toBeUndefined();
      expect(ctrl.channels[0]!.parentSpaceId).toBeUndefined();
    });

    it('appends channels', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'channels', rows: [channelRow('ch-1', 'general')] });
      push.applyOp({ op: 'append', dataset: 'channels', rows: [channelRow('ch-2', 'random')] });
      expect(ctrl.channels).toHaveLength(2);
      expect(ctrl.channels[1]!.name).toBe('random');
    });

    it('removes channels by key', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general'), channelRow('ch-2', 'random')],
      });
      push.applyOp({ op: 'remove', dataset: 'channels', key: 'ch-1' });
      expect(ctrl.channels).toHaveLength(1);
      expect(ctrl.channels[0]!.id).toBe('ch-2');
    });
  });

  describe('channelTree', () => {
    it('groups channels by space', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'general'),
          channelRow('ch-2', 'work', { spaceId: 'sp-1', spaceName: 'Alpha' }),
          channelRow('ch-3', 'observe', { spaceId: 'sp-1', spaceName: 'Alpha' }),
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.ungrouped).toHaveLength(1);
      expect(tree.ungrouped[0]!.name).toBe('general');
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.space.name).toBe('Alpha');
      expect(tree.spaces[0]!.channels).toHaveLength(2);
    });

    it('handles multiple spaces', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha'), spaceRow('sp-2', 'Beta')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'a', { spaceId: 'sp-1', spaceName: 'Alpha' }),
          channelRow('ch-2', 'b', { spaceId: 'sp-2', spaceName: 'Beta' }),
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(2);
      expect(tree.ungrouped).toHaveLength(0);
    });

    it('nests child spaces under parent spaces', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-parent', 'Parent'), spaceRow('sp-child', 'Child', { parentSpaceId: 'sp-parent' })] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'parent-ch', { spaceId: 'sp-parent', spaceName: 'Parent' }),
          channelRow('ch-2', 'child-ch', {
            spaceId: 'sp-child', spaceName: 'Child', parentSpaceId: 'sp-parent',
          }),
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.space.name).toBe('Parent');
      expect(tree.spaces[0]!.children).toHaveLength(1);
      expect(tree.spaces[0]!.children[0]!.space.name).toBe('Child');
      expect(tree.spaces[0]!.children[0]!.channels).toHaveLength(1);
    });

    it('treats child spaces with unknown parent as roots', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Orphan', { parentSpaceId: 'sp-missing' })] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'orphan', {
            spaceId: 'sp-1', spaceName: 'Orphan', parentSpaceId: 'sp-missing',
          }),
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.space.name).toBe('Orphan');
    });

    it('returns empty tree for no channels', () => {
      const { ctrl } = createPair();
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(0);
      expect(tree.ungrouped).toHaveLength(0);
    });

    it('aggregates unread counts from channels to space nodes', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Alpha', unreadCount: '3' }),
          channelRow('ch-2', 'observe', { spaceId: 'sp-1', spaceName: 'Alpha', unreadCount: '2' }),
          channelRow('ch-3', 'general', { unreadCount: '5' }),
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces[0]!.unreadCount).toBe(5);
      expect(tree.ungrouped[0]!.unreadCount).toBe(5);
    });

    it('aggregates child space unread counts into parent', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-parent', 'Parent'), spaceRow('sp-child', 'Child', { parentSpaceId: 'sp-parent' })] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'parent-ch', { spaceId: 'sp-parent', spaceName: 'Parent', unreadCount: '1' }),
          channelRow('ch-2', 'child-ch', {
            spaceId: 'sp-child', spaceName: 'Child', parentSpaceId: 'sp-parent', unreadCount: '4',
          }),
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces[0]!.children[0]!.unreadCount).toBe(4);
      expect(tree.spaces[0]!.unreadCount).toBe(5);
    });
  });

  describe('channel selection', () => {
    it('selects channel via handleEvent', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'channels', rows: [channelRow('ch-1', 'general')] });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      expect(ctrl.selectedChannelId).toBe('ch-1');
    });

    it('clears topic selection when channel changes', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'channels', rows: [channelRow('ch-1', 'a'), channelRow('ch-2', 'b')] });
      push.applyOp({ op: 'snapshot', dataset: 'topics', rows: [topicRow('t-1', 'ch-1', 'design')] });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      ctrl.handleEvent(ChannelEventTopics.SELECT_TOPIC, { channelId: 'ch-1', topicId: 't-1' });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-2' });
      expect(ctrl.selectedTopicId).toBeNull();
    });
  });

  describe('view mode', () => {
    it('starts in flat mode', () => {
      const { ctrl } = createPair();
      expect(ctrl.viewMode).toBe('flat');
    });

    it('changes view mode via handleEvent', () => {
      const { ctrl } = createPair();
      ctrl.handleEvent(ChannelEventTopics.VIEW_MODE, { mode: 'threaded' });
      expect(ctrl.viewMode).toBe('threaded');
      ctrl.handleEvent(ChannelEventTopics.VIEW_MODE, { mode: 'topics' });
      expect(ctrl.viewMode).toBe('topics');
    });
  });

  describe('message ops', () => {
    it('applies message snapshot', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', 'msg-1', { text: 'hello world' })],
      });
      expect(ctrl.messages).toHaveLength(1);
      expect(ctrl.messages[0]!.id).toBe('msg-1');
      expect(ctrl.messages[0]!.channelId).toBe('ch-1');
      expect(ctrl.messages[0]!.content).toBe('hello world');
      expect(ctrl.messages[0]!.sender).toBe('alice');
      expect(ctrl.messages[0]!.messageType).toBe('EVENT');
      expect(ctrl.messages[0]!.actorType).toBe('HUMAN');
    });

    it('appends messages', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'messages', rows: [messageRow('ch-1', 'msg-1')] });
      push.applyOp({ op: 'append', dataset: 'messages', rows: [messageRow('ch-1', 'msg-2')] });
      expect(ctrl.messages).toHaveLength(2);
    });

    it('removes messages by key', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', 'msg-1'), messageRow('ch-1', 'msg-2')],
      });
      push.applyOp({ op: 'remove', dataset: 'messages', key: 'msg-1' });
      expect(ctrl.messages).toHaveLength(1);
      expect(ctrl.messages[0]!.id).toBe('msg-2');
    });

    it('parses artefactRefs from JSON string', () => {
      const refs = JSON.stringify([{ uri: '/doc', type: 'DOCUMENT', label: 'spec' }]);
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', 'msg-1', { artefactRefs: refs })],
      });
      expect(ctrl.messages[0]!.artefactRefs).toHaveLength(1);
      expect(ctrl.messages[0]!.artefactRefs[0]!.uri).toBe('/doc');
    });

    it('handles malformed artefactRefs gracefully', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', 'msg-1', { artefactRefs: 'not-json' })],
      });
      expect(ctrl.messages[0]!.artefactRefs).toEqual([]);
    });

    it('recomputes reply counts after message changes', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [
          messageRow('ch-1', 'msg-1'),
          messageRow('ch-1', 'msg-2', { parentId: 'msg-1' }),
          messageRow('ch-1', 'msg-3', { parentId: 'msg-1' }),
        ],
      });
      const parent = ctrl.messages.find(m => m.id === 'msg-1')!;
      expect(parent.replyCount).toBe(2);
    });

    it('resolves topic name from topics array', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'topics', rows: [topicRow('t-1', 'ch-1', 'design')] });
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', 'msg-1', { topicId: 't-1' })],
      });
      expect(ctrl.messages[0]!.topic).toBe('design');
      expect(ctrl.messages[0]!.topicId).toBe('t-1');
    });
  });

  describe('real-time unread tracking', () => {
    it('increments unread on message append for non-selected channel', () => {
      const { push, ctrl } = createPair();
      ctrl.setCurrentUser('alice');
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { unreadCount: '0' }), channelRow('ch-2', 'other', { unreadCount: '0' })],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      push.applyOp({ op: 'append', dataset: 'messages', rows: [messageRow('ch-2', 'msg-1', { sender: 'bob', messageType: 'QUERY' })] });
      expect(ctrl.channels.find(c => c.id === 'ch-2')!.unreadCount).toBe(1);
    });

    it('does not increment unread for selected channel', () => {
      const { push, ctrl } = createPair();
      ctrl.setCurrentUser('alice');
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { unreadCount: '0' })],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      push.applyOp({ op: 'append', dataset: 'messages', rows: [messageRow('ch-1', 'msg-1', { sender: 'bob', messageType: 'QUERY' })] });
      expect(ctrl.channels.find(c => c.id === 'ch-1')!.unreadCount).toBe(0);
    });

    it('does not increment unread for EVENT messages', () => {
      const { push, ctrl } = createPair();
      ctrl.setCurrentUser('alice');
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { unreadCount: '0' }), channelRow('ch-2', 'other', { unreadCount: '0' })],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      push.applyOp({ op: 'append', dataset: 'messages', rows: [messageRow('ch-2', 'msg-1', { sender: 'bob', messageType: 'EVENT' })] });
      expect(ctrl.channels.find(c => c.id === 'ch-2')!.unreadCount).toBe(0);
    });

    it('does not increment unread for own messages', () => {
      const { push, ctrl } = createPair();
      ctrl.setCurrentUser('alice');
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { unreadCount: '0' }), channelRow('ch-2', 'other', { unreadCount: '0' })],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      push.applyOp({ op: 'append', dataset: 'messages', rows: [messageRow('ch-2', 'msg-1', { sender: 'alice', messageType: 'QUERY' })] });
      expect(ctrl.channels.find(c => c.id === 'ch-2')!.unreadCount).toBe(0);
    });

    it('resets unread to 0 on channel select', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general', { unreadCount: '5' })],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      expect(ctrl.channels.find(c => c.id === 'ch-1')!.unreadCount).toBe(0);
    });

    it('provides latestMessageId for a channel', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', '100'), messageRow('ch-1', '200'), messageRow('ch-2', '300')],
      });
      expect(ctrl.latestMessageId('ch-1')).toBe('200');
      expect(ctrl.latestMessageId('ch-2')).toBe('300');
      expect(ctrl.latestMessageId('ch-99')).toBeUndefined();
    });
  });

  describe('filteredMessages', () => {
    it('returns empty when no channel selected', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'messages', rows: [messageRow('ch-1', 'msg-1')] });
      expect(ctrl.filteredMessages()).toEqual([]);
    });

    it('returns messages for selected channel only', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [messageRow('ch-1', 'msg-1'), messageRow('ch-2', 'msg-2')],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      const filtered = ctrl.filteredMessages();
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.channelId).toBe('ch-1');
    });

    it('filters by topic when topic is selected', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'topics',
        rows: [topicRow('t-1', 'ch-1', 'design'), topicRow('t-2', 'ch-1', 'bugs')],
      });
      push.applyOp({
        op: 'snapshot', dataset: 'messages',
        rows: [
          messageRow('ch-1', 'msg-1', { topicId: 't-1' }),
          messageRow('ch-1', 'msg-2', { topicId: 't-2' }),
          messageRow('ch-1', 'msg-3'),
        ],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      ctrl.handleEvent(ChannelEventTopics.SELECT_TOPIC, { channelId: 'ch-1', topicId: 't-1' });
      const filtered = ctrl.filteredMessages();
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.topicId).toBe('t-1');
    });
  });

  describe('topic ops', () => {
    it('applies topic snapshot', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'topics',
        rows: [topicRow('t-1', 'ch-1', 'design')],
      });
      expect(ctrl.topics).toHaveLength(1);
      expect(ctrl.topics[0]!.name).toBe('design');
      expect(ctrl.topics[0]!.state).toBe('ACTIVE');
    });

    it('replaces topic by key', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'topics', rows: [topicRow('t-1', 'ch-1', 'design')] });
      push.applyOp({
        op: 'replace', dataset: 'topics',
        row: ['t-1', 'ch-1', 'design-v2', 'RESOLVED', '5', '', '2026-01-01T00:00:00Z'],
        key: 't-1',
      });
      expect(ctrl.topics).toHaveLength(1);
      expect(ctrl.topics[0]!.name).toBe('design-v2');
      expect(ctrl.topics[0]!.state).toBe('RESOLVED');
    });

    it('removes topic by key', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'topics',
        rows: [topicRow('t-1', 'ch-1', 'a'), topicRow('t-2', 'ch-1', 'b')],
      });
      push.applyOp({ op: 'remove', dataset: 'topics', key: 't-1' });
      expect(ctrl.topics).toHaveLength(1);
      expect(ctrl.topics[0]!.id).toBe('t-2');
    });
  });

  describe('channelTopics', () => {
    it('returns non-MERGED topics for selected channel', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'topics',
        rows: [
          topicRow('t-1', 'ch-1', 'active'),
          topicRow('t-2', 'ch-1', 'merged', { state: 'MERGED' }),
          topicRow('t-3', 'ch-2', 'other'),
        ],
      });
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      const topics = ctrl.channelTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0]!.name).toBe('active');
    });

    it('returns empty when no channel selected', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'topics', rows: [topicRow('t-1', 'ch-1', 'a')] });
      expect(ctrl.channelTopics()).toEqual([]);
    });
  });

  describe('pendingSpaces', () => {
    it('addPendingSpace makes empty space appear in channelTree', () => {
      const { ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-new', name: 'New Space' });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.space.name).toBe('New Space');
      expect(tree.spaces[0]!.channels).toHaveLength(0);
    });

    it('pending space survives snapshot when it has no channels', () => {
      const { push, ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-new', name: 'Empty Space' });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general')],
      });
      const tree = ctrl.channelTree;
      const pending = tree.spaces.find(s => s.space.id === 'sp-new');
      expect(pending).toBeDefined();
      expect(pending!.space.name).toBe('Empty Space');
    });

    it('pending space is pruned when snapshot has channels in it', () => {
      const { push, ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-1', name: 'My Space' });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'My Space' })],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.channels).toHaveLength(1);
    });

    it('removePendingSpace removes the space from tree', () => {
      const { ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-1', name: 'Temp' });
      expect(ctrl.channelTree.spaces).toHaveLength(1);
      ctrl.removePendingSpace('sp-1');
      expect(ctrl.channelTree.spaces).toHaveLength(0);
    });
  });

  describe('applyRenameSpace', () => {
    it('updates spaceName on all matching channels', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Old Name' }),
          channelRow('ch-2', 'observe', { spaceId: 'sp-1', spaceName: 'Old Name' }),
          channelRow('ch-3', 'general'),
        ],
      });
      ctrl.applyRenameSpace('sp-1', 'New Name');
      expect(ctrl.channels[0]!.spaceName).toBe('New Name');
      expect(ctrl.channels[1]!.spaceName).toBe('New Name');
      expect(ctrl.channels[2]!.spaceName).toBeUndefined();
    });

    it('updates pending space name', () => {
      const { ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-1', name: 'Old' });
      ctrl.applyRenameSpace('sp-1', 'New');
      expect(ctrl.channelTree.spaces[0]!.space.name).toBe('New');
    });
  });

  describe('applyMoveChannel', () => {
    it('updates channel spaceId and spaceName', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'general')],
      });
      ctrl.applyMoveChannel('ch-1', 'sp-1', 'Target Space');
      expect(ctrl.channels[0]!.spaceId).toBe('sp-1');
      expect(ctrl.channels[0]!.spaceName).toBe('Target Space');
    });

    it('unassigns channel from space with null', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Alpha' })],
      });
      ctrl.applyMoveChannel('ch-1', null, null);
      expect(ctrl.channels[0]!.spaceId).toBeUndefined();
      expect(ctrl.channels[0]!.spaceName).toBeUndefined();
    });
  });

  describe('applyDeleteSpace', () => {
    it('moves channels to ungrouped and removes pending space', () => {
      const { push, ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-1', name: 'Doomed' });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Doomed' })],
      });
      ctrl.applyDeleteSpace('sp-1');
      expect(ctrl.channels[0]!.spaceId).toBeUndefined();
      expect(ctrl.channelTree.spaces).toHaveLength(0);
      expect(ctrl.channelTree.ungrouped).toHaveLength(1);
    });
  });

  describe('spaces push dataset', () => {
    it('applies spaces snapshot and populates spaces array', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'spaces',
        rows: [spaceRow('sp-1', 'Alpha'), spaceRow('sp-2', 'Beta')],
      });
      expect(ctrl.spaces).toHaveLength(2);
      expect(ctrl.spaces[0]!.id).toBe('sp-1');
      expect(ctrl.spaces[0]!.name).toBe('Alpha');
    });

    it('appends new spaces', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({ op: 'append', dataset: 'spaces', rows: [spaceRow('sp-2', 'Beta')] });
      expect(ctrl.spaces).toHaveLength(2);
    });

    it('replaces existing space on replace op', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Old')] });
      push.applyOp({ op: 'replace', dataset: 'spaces', key: 'sp-1', row: spaceRow('sp-1', 'New') });
      expect(ctrl.spaces[0]!.name).toBe('New');
    });

    it('removes space on remove op', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({ op: 'remove', dataset: 'spaces', key: 'sp-1' });
      expect(ctrl.spaces).toHaveLength(0);
    });

    it('spaces snapshot prunes matching pendingSpaces', () => {
      const { push, ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-1', name: 'Pending' });
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Real')] });
      expect(ctrl.channelTree.spaces).toHaveLength(1);
      expect(ctrl.channelTree.spaces[0]!.space.name).toBe('Real');
    });

    it('spaces append prunes matching pendingSpaces', () => {
      const { push, ctrl } = createPair();
      ctrl.addPendingSpace({ id: 'sp-1', name: 'Pending' });
      push.applyOp({ op: 'append', dataset: 'spaces', rows: [spaceRow('sp-1', 'Real')] });
      const tree = ctrl.channelTree;
      const sp1Nodes = tree.spaces.filter(s => s.space.id === 'sp-1');
      expect(sp1Nodes).toHaveLength(1);
      expect(sp1Nodes[0]!.space.name).toBe('Real');
    });

    it('maps description and parentSpaceId from space row', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'spaces',
        rows: [spaceRow('sp-1', 'Alpha', { description: 'Desc', parentSpaceId: 'sp-root' })],
      });
      expect(ctrl.spaces[0]!.description).toBe('Desc');
      expect(ctrl.spaces[0]!.parentSpaceId).toBe('sp-root');
    });
  });

  describe('channelTree — spaces-first', () => {
    it('builds tree from spaces dataset — empty spaces appear', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({ op: 'snapshot', dataset: 'channels', rows: [] });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.space.name).toBe('Alpha');
      expect(tree.spaces[0]!.channels).toHaveLength(0);
    });

    it('assigns channels to spaces by spaceId', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Alpha' })],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces[0]!.channels).toHaveLength(1);
      expect(tree.spaces[0]!.channels[0]!.id).toBe('ch-1');
    });

    it('treats channels with unknown spaceId as ungrouped', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-unknown', spaceName: 'Missing' })],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(0);
      expect(tree.ungrouped).toHaveLength(1);
    });

    it('uses space name from spaces dataset, not channel spaceName', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Authoritative Name')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Stale Name' })],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces[0]!.space.name).toBe('Authoritative Name');
    });

    it('builds parent-child hierarchy from parentSpaceId', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'spaces',
        rows: [spaceRow('sp-root', 'Root'), spaceRow('sp-child', 'Child', { parentSpaceId: 'sp-root' })],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0]!.space.id).toBe('sp-root');
      expect(tree.spaces[0]!.children).toHaveLength(1);
      expect(tree.spaces[0]!.children[0]!.space.id).toBe('sp-child');
    });

    it('merges pendingSpaces not in spaces dataset', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Real')] });
      ctrl.addPendingSpace({ id: 'sp-new', name: 'Pending' });
      const tree = ctrl.channelTree;
      expect(tree.spaces).toHaveLength(2);
    });
  });

  describe('applyRenameSpace — spaces-first', () => {
    it('updates name in spaces array', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Old')] });
      ctrl.applyRenameSpace('sp-1', 'New');
      expect(ctrl.spaces[0]!.name).toBe('New');
    });
  });

  describe('applyDeleteSpace — spaces-first', () => {
    it('removes from spaces array', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Doomed')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [channelRow('ch-1', 'work', { spaceId: 'sp-1', spaceName: 'Doomed' })],
      });
      ctrl.applyDeleteSpace('sp-1');
      expect(ctrl.spaces).toHaveLength(0);
      expect(ctrl.channelTree.ungrouped).toHaveLength(1);
    });
  });

  describe('channel position', () => {
    it('parses position from row index 9', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [['ch-1', 'alpha', '', '', 'false', '', '', '', '', '500']],
      });
      expect((ctrl.channels[0] as any).position).toBe(500);
    });

    it('sorts channels within space by position (null last)', () => {
      const { push, ctrl } = createPair();
      push.applyOp({ op: 'snapshot', dataset: 'spaces', rows: [spaceRow('sp-1', 'Alpha')] });
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [
          ['ch-a', 'charlie', '', '', 'false', 'sp-1', 'Alpha', '', '', '2000'],
          ['ch-b', 'alpha', '', '', 'false', 'sp-1', 'Alpha', '', '', '1000'],
          ['ch-c', 'bravo', '', '', 'false', 'sp-1', 'Alpha', '', '', ''],
        ],
      });
      const tree = ctrl.channelTree;
      expect(tree.spaces[0]!.channels[0]!.id).toBe('ch-b');
      expect(tree.spaces[0]!.channels[1]!.id).toBe('ch-a');
      expect(tree.spaces[0]!.channels[2]!.id).toBe('ch-c');
    });

    it('applyReorder updates channel position', () => {
      const { push, ctrl } = createPair();
      push.applyOp({
        op: 'snapshot', dataset: 'channels',
        rows: [['ch-1', 'work', '', '', 'false', '', '', '', '', '1000']],
      });
      ctrl.applyReorder('ch-1', 500);
      expect((ctrl.channels[0] as any).position).toBe(500);
    });
  });

  describe('host updates', () => {
    it('triggers host update on channel snapshot', () => {
      const { host, push } = createPair();
      const before = host.updateCount;
      push.applyOp({ op: 'snapshot', dataset: 'channels', rows: [channelRow('ch-1', 'general')] });
      expect(host.updateCount).toBeGreaterThan(before);
    });

    it('triggers host update on message append', () => {
      const { host, push } = createPair();
      const before = host.updateCount;
      push.applyOp({ op: 'append', dataset: 'messages', rows: [messageRow('ch-1', 'msg-1')] });
      expect(host.updateCount).toBeGreaterThan(before);
    });

    it('triggers host update on handleEvent', () => {
      const { host, ctrl } = createPair();
      const before = host.updateCount;
      ctrl.handleEvent(ChannelEventTopics.SELECT_CHANNEL, { channelId: 'ch-1' });
      expect(host.updateCount).toBeGreaterThan(before);
    });
  });
});
