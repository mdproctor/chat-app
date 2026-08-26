import type { ReactiveController, ReactiveControllerHost } from 'lit';

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export interface DatasetOp {
  op: 'snapshot' | 'append' | 'replace' | 'remove';
  dataset: string;
  rows?: unknown[][];
  row?: unknown[];
  key?: string;
}

export type DatasetHandler = (op: DatasetOp) => void;

export const ALL_TOPICS = [
  'chat:channels', 'chat:topics', 'chat:messages',
  'chat:members', 'chat:presence', 'chat:reactions', 'chat:commitments',
  'chat:spaces',
];

export class PushController implements ReactiveController {
  connectionStatus: ConnectionStatus = 'disconnected';
  private _handlers = new Map<string, DatasetHandler[]>();
  private _host: ReactiveControllerHost;

  constructor(host: ReactiveControllerHost) {
    this._host = host;
    host.addController(this);
  }

  setConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this._host.requestUpdate();
  }

  registerDatasetHandler(dataset: string, handler: DatasetHandler) {
    const list = this._handlers.get(dataset) ?? [];
    list.push(handler);
    this._handlers.set(dataset, list);
  }

  applyOp(op: DatasetOp) {
    const handlers = this._handlers.get(op.dataset);
    if (handlers) for (const h of handlers) h(op);
  }

  hostConnected() {}
  hostDisconnected() {}
}
