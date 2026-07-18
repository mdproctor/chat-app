import type { CommitmentState } from '@casehubio/blocks-ui-channel-activity';

export interface CommitmentRecord {
  readonly state: CommitmentState;
  readonly deadline?: string;
  readonly acknowledgedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const ARTEFACT_SELECTED = 'channel:artefact-selected';
