export const MESSAGE_TYPES = [
  'QUERY', 'COMMAND', 'RESPONSE', 'STATUS', 'DONE',
  'FAILURE', 'DECLINE', 'HANDOFF', 'EVENT',
] as const;
export type MessageType = typeof MESSAGE_TYPES[number];

export const ACTOR_TYPES = ['HUMAN', 'AGENT', 'SYSTEM'] as const;
export type ActorType = typeof ACTOR_TYPES[number];

export {
  COMMITMENT_STATES,
  type CommitmentState,
  type StateCategory,
  commitmentStateCategory,
  isTerminalCommitmentState,
} from '@casehubio/blocks-ui-core';

export const CHANNEL_SEMANTICS = [
  'APPEND', 'COLLECT', 'BARRIER', 'EPHEMERAL', 'LAST_WRITE',
] as const;
export type ChannelSemantic = typeof CHANNEL_SEMANTICS[number];

export const ARTEFACT_TYPES = [
  'DOCUMENT', 'CODE', 'CASE', 'WORK_ITEM', 'CHANNEL',
  'DEBATE', 'MESSAGE', 'EXTERNAL',
] as const;
export type ArtefactType = typeof ARTEFACT_TYPES[number];

export interface SelectionScope {
  readonly startLine?: number;
  readonly endLine?: number;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly selectedText?: string;
}

export interface ArtefactRef {
  readonly uri: string;
  readonly type: ArtefactType;
  readonly label: string;
  readonly scope?: SelectionScope;
}

export interface ResolvedArtifact {
  readonly content: string;
  readonly language?: string;
}

export interface ChatMessageRef {
  readonly platform: string;
  readonly externalId: string;
}

export interface QhorusMessage {
  readonly id: string;
  readonly channelId: string;
  readonly sender: string;
  readonly messageType: MessageType;
  readonly actorType: ActorType;
  readonly content: string;
  readonly topic: string;
  readonly topicId?: string;
  readonly correlationId?: string;
  readonly inReplyTo?: string;
  readonly parentRef?: ChatMessageRef;
  readonly replyCount: number;
  readonly artefactRefs: readonly ArtefactRef[];
  readonly target?: string;
  readonly commitmentId?: string;
  readonly deadline?: string;
  readonly acknowledgedAt?: string;
  readonly createdAt: string;
}

export interface QhorusChannel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly semantic: ChannelSemantic;
  readonly allowedTypes?: readonly MessageType[];
  readonly deniedTypes?: readonly MessageType[];
  readonly paused: boolean;
  readonly spaceId?: string;
  readonly spaceName?: string;
  readonly parentSpaceId?: string;
  readonly unreadCount?: number;
  readonly position?: number;
}

export interface Reaction {
  readonly messageId: string;
  readonly emoji: string;
  readonly actorId: string;
  readonly createdAt: string;
}

export interface ChannelMember {
  readonly channelId: string;
  readonly memberId: string;
  readonly displayName: string;
  readonly role: 'PARTICIPANT' | 'OBSERVER' | 'MODERATOR';
  readonly actorType?: ActorType;
}

export interface PresenceState {
  readonly memberId: string;
  readonly status: 'ONLINE' | 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE';
  readonly lastSeenAt?: string;
  readonly statusMessage?: string;
}

export const TOPIC_STATES = ['ACTIVE', 'RESOLVED', 'ARCHIVED', 'MERGED'] as const;
export type TopicState = typeof TOPIC_STATES[number];

export interface QhorusTopic {
  readonly id: string;
  readonly channelId: string;
  readonly name: string;
  readonly state: TopicState;
  readonly messageCount: number;
  readonly latestActivityTs?: string;
  readonly createdAt: string;
}

export function isTerminalMessageType(type: MessageType): boolean {
  return type === 'DONE' || type === 'FAILURE' || type === 'DECLINE' || type === 'HANDOFF';
}

export function isObligationCreating(type: MessageType): boolean {
  return type === 'COMMAND';
}

export function messageTypeCategory(type: MessageType): 'info' | 'obligation' | 'success' | 'danger' | 'warning' | 'transfer' | 'telemetry' {
  switch (type) {
    case 'QUERY': case 'RESPONSE': case 'STATUS': return 'info';
    case 'COMMAND': return 'obligation';
    case 'DONE': return 'success';
    case 'FAILURE': return 'danger';
    case 'DECLINE': return 'warning';
    case 'HANDOFF': return 'transfer';
    case 'EVENT': return 'telemetry';
  }
}
