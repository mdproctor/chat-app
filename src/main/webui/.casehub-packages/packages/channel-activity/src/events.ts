import type { QhorusMessage, MessageType, ArtefactRef } from './types.js';

export const ChannelEventTopics = {
  SEND_MESSAGE: 'channel:send-message',
  REACT: 'channel:react',
  UNREACT: 'channel:unreact',
  CREATE_CHANNEL: 'channel:create',
  DELETE_CHANNEL: 'channel:delete',
  SELECT_CHANNEL: 'channel:selected',
  MESSAGE_SELECTED: 'channel:message-selected',
  CURSOR_CATCHUP: 'channel:cursor-catchup',
  CURSOR_RELOAD: 'channel:cursor-reload',
  SELECT_TOPIC: 'channel:select-topic',
  VIEW_MODE: 'channel:view-mode',
  CREATE_TOPIC: 'channel:create-topic',
  RESOLVE_TOPIC: 'channel:resolve-topic',
  REOPEN_TOPIC: 'channel:reopen-topic',
  ARCHIVE_TOPIC: 'channel:archive-topic',
  RENAME_TOPIC: 'channel:rename-topic',
  MERGE_TOPIC: 'channel:merge-topic',
  ARTEFACT_SELECTED: 'channel:artefact-selected',
  CREATE_SPACE: 'space:create',
  RENAME_SPACE: 'space:rename',
  DELETE_SPACE: 'space:delete',
  MOVE_CHANNEL_TO_SPACE: 'channel:move-to-space',
  REORDER_CHANNEL: 'channel:reorder',
} as const;

export interface SendMessagePayload {
  readonly channelId: string;
  readonly content: string;
  readonly topic?: string;
  readonly topicId?: string;
  readonly inReplyTo?: string;
  readonly speechAct?: MessageType;
  readonly artefactRefs?: readonly ArtefactRef[];
}

export interface SelectTopicPayload {
  readonly channelId: string;
  readonly topicId: string | null;
}

export interface ViewModePayload {
  readonly mode: 'flat' | 'threaded' | 'topics';
}

export interface TopicActionPayload {
  readonly channelId: string;
  readonly topicId: string;
}

export interface RenameTopicPayload {
  readonly channelId: string;
  readonly topicId: string;
  readonly newName: string;
}

export interface MergeTopicPayload {
  readonly channelId: string;
  readonly sourceTopicId: string;
  readonly targetTopicId: string;
}

export interface CreateTopicPayload {
  readonly channelId: string;
  readonly name: string;
}

export interface ReactPayload {
  readonly messageId: string;
  readonly emoji: string;
}

export interface CreateChannelPayload {
  readonly name: string;
  readonly description?: string;
  readonly spaceId?: string;
  readonly semantic?: string;
}

export interface DeleteChannelPayload {
  readonly channelId: string;
}

export interface SelectChannelPayload {
  readonly channelId: string;
}

export interface MessageSelectedPayload {
  readonly message: QhorusMessage;
}

export interface CursorActionPayload {
  readonly channelId: string;
  readonly cursorId?: string;
}

export interface CreateSpacePayload {
  readonly name: string;
}

export interface RenameSpacePayload {
  readonly spaceId: string;
  readonly newName: string;
}

export interface DeleteSpacePayload {
  readonly spaceId: string;
}

export interface MoveChannelToSpacePayload {
  readonly channelId: string;
  readonly spaceId: string | null;
  readonly position?: number;
}

export interface ReorderChannelPayload {
  readonly channelId: string;
  readonly spaceId: string | null;
  readonly position: number;
}
