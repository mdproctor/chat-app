import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { QhorusChannel, ChannelSemantic } from './types.js';
import type { ChannelTree, SpaceNode } from './channel-state-controller.js';
import { emitPagesEvent } from '@casehubio/pages-component';
import { PagesConfirmDialog } from '@casehubio/pages-ui-components';
import { ChannelEventTopics } from './events.js';
import '@casehubio/pages-ui-components';

@customElement('blocks-channel-nav')
export class ChannelNavElement extends LitElement {
  @property({ type: Array }) channels: QhorusChannel[] = [];
  @property({ type: String }) selectedChannelId?: string;
  @property({ type: String }) layout: 'sidebar' | 'dropdown' = 'sidebar';
  @property({ type: Object }) channelTree?: ChannelTree;
  @property({ type: Boolean }) showCreate = true;
  @property({ type: Boolean }) showDelete = true;
  @state() private _focusedIndex = 0;
  @state() private _expandedSpaces = new Set<string>();
  @state() private _spaceFilter = '';
  @state() private _dropdownOpen = false;
  @state() private _deleteTarget: QhorusChannel | null = null;
  @state() private _showCreateDialog = false;
  @state() private _contextMenu: { x: number; y: number; type: 'space' | 'channel'; target: SpaceNode | QhorusChannel } | null = null;
  @state() private _renamingSpaceId: string | null = null;
  @state() private _renameValue = '';
  @state() private _showCreateSpaceDialog = false;
  @state() private _showDeleteSpaceDialog = false;
  @state() private _deleteSpaceTarget: SpaceNode | null = null;
  @state() private _createChannelInSpaceId: string | null = null;
  @state() private _dragChannelId: string | null = null;
  private _dragActive = false;
  private _dragHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private _dragGhost: HTMLElement | null = null;
  private _dragInsertionLine: HTMLElement | null = null;
  private _dragDropTarget: { spaceId: string | null; position: number } | null = null;

  static override readonly styles = css`
    :host {
      display: block;
      padding: var(--pages-space-3, 12px);
      background: var(--pages-neutral-1, #ffffff);
      color: var(--pages-neutral-12, #1a1a1a);
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
    }
    .channel-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--pages-space-1, 4px);
    }
    .channel-item {
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
      padding: var(--pages-space-2, 8px);
      border-radius: var(--pages-radius-1, 4px);
      cursor: pointer;
      transition: background 0.2s;
      position: relative;
    }
    .channel-item:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .channel-item.selected { background: var(--pages-accent-3, #e0f2fe); }
    .channel-item.focused {
      outline: 2px solid var(--pages-accent-7, #818cf8);
      outline-offset: -2px;
    }
    .channel-icon {
      flex-shrink: 0;
      font-size: 14px;
      color: var(--pages-neutral-9, #999);
      margin-right: 2px;
    }
    .channel-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .delete-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--pages-neutral-8, #6b7280);
      cursor: pointer;
      padding: var(--pages-space-1, 4px);
      border-radius: var(--pages-radius-1, 4px);
      font-size: 14px;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.2s, background 0.2s;
    }
    .channel-item:hover .delete-btn { opacity: 1; }
    .delete-btn:hover {
      background: var(--pages-neutral-4, #e5e5e5);
      color: var(--pages-danger-1, #dc2626);
    }
    .create-channel-btn {
      margin-top: var(--pages-space-3, 12px);
      width: 100%;
      padding: var(--pages-space-2, 8px);
      background: var(--pages-accent-9, #0ea5e9);
      color: var(--pages-neutral-1, #fff);
      border: none;
      border-radius: var(--pages-radius-1, 4px);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s;
    }
    .create-channel-btn:hover { background: var(--pages-accent-10, #0284c7); }
    pages-badge { flex-shrink: 0; }
    .space-header {
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
      padding: var(--pages-space-2, 8px);
      border-radius: var(--pages-radius-1, 4px);
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
    }
    .space-header:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .space-disclosure {
      flex-shrink: 0;
      font-size: 10px;
      color: var(--pages-neutral-9, #999);
      width: 12px;
      text-align: center;
    }
    .space-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .space-channels {
      list-style: none;
      margin: 0;
      padding: 0 0 0 var(--pages-space-4, 16px);
    }
    .ungrouped {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .space-filter {
      width: 100%;
      padding: var(--pages-space-2, 8px);
      margin-bottom: var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-1, 4px);
      background: var(--pages-neutral-1, #ffffff);
      color: var(--pages-neutral-12, #1a1a1a);
      font-size: 13px;
      cursor: pointer;
      box-sizing: border-box;
    }
    .space-filter:hover { border-color: var(--pages-neutral-7, #a3a3a3); }
    .dropdown-wrapper { position: relative; }
    .dropdown-trigger {
      width: 100%;
      padding: var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-1, 4px);
      background: var(--pages-neutral-1, #ffffff);
      color: var(--pages-neutral-12, #1a1a1a);
      font-size: 14px;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .dropdown-trigger:hover { border-color: var(--pages-neutral-7, #a3a3a3); }
    .dropdown-arrow { font-size: 10px; color: var(--pages-neutral-8, #888); }
    .dropdown-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 2px;
      background: var(--pages-neutral-1, #ffffff);
      border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-1, 4px);
      box-shadow: var(--pages-shadow-3, 0 4px 12px rgba(0,0,0,0.1));
      z-index: 10;
      max-height: 200px;
      overflow-y: auto;
      list-style: none;
      margin-left: 0;
      padding: var(--pages-space-1, 4px);
    }
    .dropdown-option {
      padding: var(--pages-space-2, 8px);
      cursor: pointer;
      border-radius: var(--pages-radius-1, 4px);
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .dropdown-option:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .dropdown-option.selected { background: var(--pages-accent-3, #e0f2fe); }
    .dropdown-option.focused { outline: 2px solid var(--pages-accent-7, #818cf8); outline-offset: -2px; }
    .dropdown-count {
      font-size: var(--pages-font-size-xs, 11px);
      color: var(--pages-neutral-8, #888);
    }
    .context-menu { position: fixed; background: var(--pages-neutral-1, #fff); border: 1px solid var(--pages-neutral-5, #d4d4d4); border-radius: var(--pages-radius-1, 4px); box-shadow: var(--pages-shadow-3, 0 4px 12px rgba(0,0,0,0.1)); z-index: 100; min-width: 180px; padding: var(--pages-space-1, 4px); }
    .context-menu-item { padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px); cursor: pointer; border-radius: var(--pages-radius-1, 4px); font-size: 13px; display: flex; align-items: center; justify-content: space-between; }
    .context-menu-item:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .context-menu-item.danger:hover { color: var(--pages-danger-1, #dc2626); }
    .context-menu-separator { height: 1px; background: var(--pages-neutral-4, #e5e5e5); margin: var(--pages-space-1, 4px) 0; }
    .submenu-trigger { position: relative; }
    .submenu-trigger .submenu { display: none; }
    .submenu-trigger:hover .submenu { display: block; }
    .channel-item.dragging { opacity: 0.3; }
    .space-header.drop-target { background: var(--pages-accent-2, #eef2ff); }
    .submenu { position: absolute; left: 100%; top: 0; }
    .space-rename-input { flex: 1; font-weight: 600; font-size: 14px; border: 1px solid var(--pages-accent-7, #818cf8); border-radius: var(--pages-radius-1, 4px); padding: 2px 4px; background: var(--pages-neutral-1, #fff); color: var(--pages-neutral-12, #1a1a1a); outline: none; }
    .space-filter-row { display: flex; gap: var(--pages-space-1, 4px); align-items: center; margin-bottom: var(--pages-space-2, 8px); }
    .space-filter-row .space-filter { flex: 1; }
    .create-space-btn { width: 28px; height: 28px; border: 1px solid var(--pages-neutral-5, #d4d4d4); border-radius: var(--pages-radius-1, 4px); background: var(--pages-neutral-1, #fff); cursor: pointer; font-size: 16px; color: var(--pages-neutral-9, #999); display: flex; align-items: center; justify-content: center; }
    .create-space-btn:hover { background: var(--pages-neutral-3, #f5f5f5); color: var(--pages-neutral-12, #1a1a1a); }
  `;

  private getChannelIcon(_semantic: ChannelSemantic): string {
    return '#';
  }

  private handleChannelClick(channelId: string): void {
    emitPagesEvent(this, ChannelEventTopics.SELECT_CHANNEL, { channelId });
  }

  private handleDeleteClick(event: MouseEvent, channel: QhorusChannel): void {
    event.stopPropagation();
    this._deleteTarget = channel;
  }

  private _onDeleteConfirm(): void {
    if (this._deleteTarget) {
      emitPagesEvent(this, ChannelEventTopics.DELETE_CHANNEL, { channelId: this._deleteTarget.id });
    }
    this._deleteTarget = null;
  }

  private _onDeleteCancel(): void {
    this._deleteTarget = null;
  }

  private handleCreateChannel(): void {
    this._showCreateDialog = true;
  }

  private _onCreateConfirm(e: CustomEvent<{ reason?: string }>): void {
    const name = e.detail?.reason?.trim();
    if (name) {
      const payload: { name: string; spaceId?: string } = { name };
      if (this._createChannelInSpaceId) payload.spaceId = this._createChannelInSpaceId;
      emitPagesEvent(this, ChannelEventTopics.CREATE_CHANNEL, payload);
    }
    this._showCreateDialog = false;
    this._createChannelInSpaceId = null;
  }

  private _onCreateCancel(): void {
    this._showCreateDialog = false;
  }

  private get _dropdownChannels(): QhorusChannel[] {
    return this.channelTree
      ? [...this.channelTree.ungrouped, ...this.channelTree.spaces.flatMap(s => s.channels)]
      : this.channels;
  }

  private _toggleDropdown(): void {
    this._dropdownOpen = !this._dropdownOpen;
    if (this._dropdownOpen) {
      this._focusedIndex = Math.max(0, this._dropdownChannels.findIndex(c => c.id === this.selectedChannelId));
      document.addEventListener('click', this._closeDropdown);
    } else {
      document.removeEventListener('click', this._closeDropdown);
    }
  }

  private _closeDropdown = (): void => {
    this._dropdownOpen = false;
    document.removeEventListener('click', this._closeDropdown);
  };

  private _selectDropdownItem(channelId: string): void {
    this._dropdownOpen = false;
    document.removeEventListener('click', this._closeDropdown);
    emitPagesEvent(this, ChannelEventTopics.SELECT_CHANNEL, { channelId });
  }

  private _handleDropdownKeyDown(event: KeyboardEvent): void {
    const channels = this._dropdownChannels;
    if (channels.length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this._dropdownOpen) { this._toggleDropdown(); return; }
        this._focusedIndex = Math.min(this._focusedIndex + 1, channels.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._focusedIndex = Math.max(this._focusedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (this._dropdownOpen) {
          const focused = channels[this._focusedIndex];
          if (focused) this._selectDropdownItem(focused.id);
        } else {
          this._toggleDropdown();
        }
        break;
      case 'Escape':
        if (this._dropdownOpen) {
          event.preventDefault();
          this._closeDropdown();
        }
        break;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._closeDropdown);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.channels.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._focusedIndex = Math.min(this._focusedIndex + 1, this.channels.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._focusedIndex = Math.max(this._focusedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        const focused = this.channels[this._focusedIndex];
        if (focused) {
          this.handleChannelClick(focused.id);
        }
        break;
    }
  }

  private _seenSpaces = new Set<string>();

  private _ensureExpanded(tree: ChannelTree) {
    for (const space of tree.spaces) {
      if (!this._seenSpaces.has(space.space.id)) {
        this._seenSpaces.add(space.space.id);
        this._expandedSpaces.add(space.space.id);
      }
      for (const child of space.children) {
        if (!this._seenSpaces.has(child.space.id)) {
          this._seenSpaces.add(child.space.id);
          this._expandedSpaces.add(child.space.id);
        }
      }
    }
  }

  private _toggleSpace(spaceId: string) {
    const next = new Set(this._expandedSpaces);
    if (next.has(spaceId)) {
      next.delete(spaceId);
    } else {
      next.add(spaceId);
    }
    this._expandedSpaces = next;
  }

  private _showContextMenu(e: MouseEvent, type: 'space' | 'channel', target: SpaceNode | QhorusChannel) {
    e.preventDefault();
    e.stopPropagation();
    const clampedX = Math.min(e.clientX, window.innerWidth - 200);
    const clampedY = Math.min(e.clientY, window.innerHeight - 200);
    this._contextMenu = { x: clampedX, y: clampedY, type, target };
    requestAnimationFrame(() => {
      document.addEventListener('click', this._dismissContextMenu, { once: true });
    });
  }

  private _dismissContextMenu = () => { this._contextMenu = null; };

  private _startRename(spaceId: string, currentName: string) {
    this._contextMenu = null;
    this._renamingSpaceId = spaceId;
    this._renameValue = currentName;
  }

  private _commitRename() {
    if (this._renamingSpaceId && this._renameValue.trim()) {
      emitPagesEvent(this, ChannelEventTopics.RENAME_SPACE, {
        spaceId: this._renamingSpaceId, newName: this._renameValue.trim(),
      });
    }
    this._renamingSpaceId = null;
  }

  private _handleRenameKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); this._commitRename(); }
    if (e.key === 'Escape') { e.preventDefault(); this._renamingSpaceId = null; }
  }

  private _handleCreateSpace() { this._showCreateSpaceDialog = true; }

  private _onCreateSpaceConfirm(e: CustomEvent<{ reason?: string }>) {
    const name = e.detail?.reason?.trim();
    if (name) emitPagesEvent(this, ChannelEventTopics.CREATE_SPACE, { name });
    this._showCreateSpaceDialog = false;
  }

  private _handleDeleteSpace(node: SpaceNode) {
    this._contextMenu = null;
    this._deleteSpaceTarget = node;
    this._showDeleteSpaceDialog = true;
  }

  private _onDeleteSpaceConfirm() {
    if (this._deleteSpaceTarget) {
      emitPagesEvent(this, ChannelEventTopics.DELETE_SPACE, { spaceId: this._deleteSpaceTarget.space.id });
    }
    this._deleteSpaceTarget = null;
    this._showDeleteSpaceDialog = false;
  }

  private _handleCreateChannelInSpace(spaceId: string) {
    this._contextMenu = null;
    this._createChannelInSpaceId = spaceId;
    this._showCreateDialog = true;
  }

  private _emitMoveChannel(channelId: string, spaceId: string | null) {
    emitPagesEvent(this, ChannelEventTopics.MOVE_CHANNEL_TO_SPACE, { channelId, spaceId });
  }

  private _renderContextMenu(): unknown {
    if (!this._contextMenu) return nothing;
    const { x, y, type, target } = this._contextMenu;
    if (type === 'space') {
      const node = target as SpaceNode;
      return html`
        <div class="context-menu" style="left:${x}px;top:${y}px" @click="${(e: Event) => e.stopPropagation()}">
          <div class="context-menu-item" @click="${() => this._startRename(node.space.id, node.space.name)}">Rename</div>
          <div class="context-menu-item danger" @click="${() => this._handleDeleteSpace(node)}">Delete</div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" @click="${() => this._handleCreateChannelInSpace(node.space.id)}">Create Channel Here</div>
        </div>`;
    }
    if (type === 'channel') {
      const channel = target as QhorusChannel;
      const spaces = this.channelTree?.spaces ?? [];
      return html`
        <div class="context-menu" style="left:${x}px;top:${y}px" @click="${(e: Event) => e.stopPropagation()}">
          <div class="context-menu-item submenu-trigger">
            Move to Space ▸
            <div class="context-menu submenu">
              ${spaces.filter(s => s.space.id !== channel.spaceId).map(s => html`
                <div class="context-menu-item" @click="${() => { this._contextMenu = null; this._emitMoveChannel(channel.id, s.space.id); }}">${s.space.name}</div>
              `)}
              ${channel.spaceId ? html`
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" @click="${() => { this._contextMenu = null; this._emitMoveChannel(channel.id, null); }}">No Space</div>
              ` : nothing}
            </div>
          </div>
        </div>`;
    }
    return nothing;
  }

  private _renderChannelItem(channel: QhorusChannel): unknown {
    return html`
      <li class="channel-item ${this.selectedChannelId === channel.id ? 'selected' : ''} ${this._dragChannelId === channel.id ? 'dragging' : ''}"
          role="option"
          aria-selected="${this.selectedChannelId === channel.id}"
          data-channel-id="${channel.id}"
          @pointerdown="${(e: PointerEvent) => this._onDragPointerDown(e, channel)}"
          @click="${() => this.handleChannelClick(channel.id)}"
          @contextmenu="${(e: MouseEvent) => this._showContextMenu(e, 'channel', channel)}">
        <span class="channel-icon">${this.getChannelIcon(channel.semantic)}</span>
        <span class="channel-name">${channel.name}</span>
        ${channel.unreadCount ? html`<pages-badge variant="neutral" size="sm" label="${channel.unreadCount}"></pages-badge>` : nothing}
        ${this.showDelete ? html`
          <pages-button variant="ghost" size="sm" class="delete-btn"
            aria-label="Delete channel ${channel.name}"
            @click="${(e: MouseEvent) => this.handleDeleteClick(e, channel)}">✕</pages-button>
        ` : nothing}
      </li>
    `;
  }

  private _renderSpaceGroup(node: SpaceNode): unknown {
    const expanded = this._expandedSpaces.has(node.space.id);
    const renaming = this._renamingSpaceId === node.space.id;
    return html`
      <div class="space-group">
        <div class="space-header"
             data-space-id="${node.space.id}"
             @click="${renaming ? nothing : () => this._toggleSpace(node.space.id)}"
             @contextmenu="${(e: MouseEvent) => this._showContextMenu(e, 'space', node)}"
             role="button" aria-expanded="${expanded}">
          <span class="space-disclosure">${expanded ? '▾' : '▸'}</span>
          ${renaming ? html`
            <input class="space-rename-input" type="text"
              .value="${this._renameValue}"
              @input="${(e: InputEvent) => { this._renameValue = (e.target as HTMLInputElement).value; }}"
              @keydown="${this._handleRenameKeyDown}"
              @blur="${this._commitRename}">
          ` : html`<span class="space-name">${node.space.name}</span>`}
          ${!renaming && node.unreadCount ? html`<pages-badge variant="neutral" size="sm" label="${node.unreadCount}"></pages-badge>` : nothing}
        </div>
        ${expanded ? html`
          <ul class="space-channels">
            ${node.channels.map(ch => this._renderChannelItem(ch))}
          </ul>
          ${node.children.map(child => this._renderSpaceGroup(child))}
        ` : nothing}
      </div>
    `;
  }

  private _onDragPointerDown(e: PointerEvent, channel: QhorusChannel) {
    if (e.button !== 0) return;
    this._dragChannelId = channel.id;
    this._dragHoldTimer = setTimeout(() => {
      this._dragActive = true;
      this._dragGhost = this._createDragGhost(channel);
      this._updateDragGhost(e.clientX, e.clientY);
    }, 150);

    const onMove = (me: PointerEvent) => {
      if (!this._dragActive) return;
      me.preventDefault();
      this._updateDragGhost(me.clientX, me.clientY);
      this._updateDragDropTarget(me.clientY, channel);
    };
    const onUp = () => {
      this.removeEventListener('pointermove', onMove);
      this.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onEscape);
      if (this._dragHoldTimer) { clearTimeout(this._dragHoldTimer); this._dragHoldTimer = null; }
      if (this._dragActive && this._dragDropTarget) {
        this._executeDragDrop(channel);
      }
      this._cleanupDrag();
    };
    const onEscape = (ke: KeyboardEvent) => {
      if (ke.key === 'Escape') {
        this.removeEventListener('pointermove', onMove);
        this.removeEventListener('pointerup', onUp);
        document.removeEventListener('keydown', onEscape);
        if (this._dragHoldTimer) { clearTimeout(this._dragHoldTimer); this._dragHoldTimer = null; }
        this._cleanupDrag();
      }
    };
    this.addEventListener('pointermove', onMove);
    this.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', onEscape);
  }

  private _createDragGhost(channel: QhorusChannel): HTMLElement {
    const ghost = document.createElement('div');
    ghost.textContent = `# ${channel.name}`;
    ghost.style.cssText = 'position:fixed;pointer-events:none;opacity:0.7;padding:4px 8px;background:var(--pages-neutral-2,#f5f5f5);border-radius:4px;font-size:13px;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.15);transform:translate(-50%,-50%);';
    document.body.appendChild(ghost);
    return ghost;
  }

  private _updateDragGhost(x: number, y: number) {
    if (this._dragGhost) {
      this._dragGhost.style.left = `${x}px`;
      this._dragGhost.style.top = `${y}px`;
    }
  }

  private _updateDragDropTarget(y: number, draggedChannel: QhorusChannel) {
    this._dragDropTarget = null;
    this._removeDragInsertionLine();
    this.shadowRoot!.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    const items = this.shadowRoot!.querySelectorAll('.channel-item');
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        const channelId = (item as HTMLElement).dataset.channelId;
        if (channelId === draggedChannel.id) continue;
        const ch = this.channelTree?.spaces.flatMap(s => s.channels).concat(this.channelTree?.ungrouped ?? []).find(c => c.id === channelId);
        if (!ch) continue;
        const midY = rect.top + rect.height / 2;
        const insertBefore = y < midY;
        const targetPos = insertBefore
          ? Math.max(0, (ch.position ?? 0) - 500)
          : (ch.position ?? 0) + 500;
        this._dragDropTarget = { spaceId: ch.spaceId ?? null, position: targetPos };
        this._showDragInsertionLine(insertBefore ? rect.top : rect.bottom);
        return;
      }
    }

    const headers = this.shadowRoot!.querySelectorAll('.space-header');
    for (const header of headers) {
      const rect = header.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        const spaceId = (header as HTMLElement).dataset.spaceId;
        if (spaceId) {
          this._dragDropTarget = { spaceId, position: 0 };
          (header as HTMLElement).classList.add('drop-target');
        }
        return;
      }
    }
  }

  private _executeDragDrop(draggedChannel: QhorusChannel) {
    if (!this._dragDropTarget) return;
    const { spaceId, position } = this._dragDropTarget;
    if (spaceId !== (draggedChannel.spaceId ?? null)) {
      emitPagesEvent(this, ChannelEventTopics.MOVE_CHANNEL_TO_SPACE, { channelId: draggedChannel.id, spaceId, position });
    } else {
      emitPagesEvent(this, ChannelEventTopics.REORDER_CHANNEL, { channelId: draggedChannel.id, spaceId, position });
    }
  }

  private _showDragInsertionLine(y: number) {
    if (!this._dragInsertionLine) {
      this._dragInsertionLine = document.createElement('div');
      this._dragInsertionLine.style.cssText = 'position:fixed;height:2px;background:var(--pages-accent-7,#818cf8);pointer-events:none;z-index:50;';
      this.shadowRoot!.appendChild(this._dragInsertionLine);
    }
    const hostRect = this.getBoundingClientRect();
    this._dragInsertionLine.style.left = `${hostRect.left}px`;
    this._dragInsertionLine.style.width = `${hostRect.width}px`;
    this._dragInsertionLine.style.top = `${y}px`;
  }

  private _removeDragInsertionLine() {
    if (this._dragInsertionLine) { this._dragInsertionLine.remove(); this._dragInsertionLine = null; }
  }

  private _cleanupDrag() {
    if (this._dragGhost) { this._dragGhost.remove(); this._dragGhost = null; }
    this._removeDragInsertionLine();
    this.shadowRoot!.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    this._dragChannelId = null;
    this._dragActive = false;
    this._dragDropTarget = null;
  }

  private _onSpaceFilterChange(e: Event) {
    this._spaceFilter = (e.target as HTMLSelectElement).value;
  }

  private _renderTree(): unknown {
    const tree = this.channelTree!;
    this._ensureExpanded(tree);
    const filteredSpaces = this._spaceFilter
      ? tree.spaces.filter(s => s.space.id === this._spaceFilter)
      : tree.spaces;
    return html`
      <div class="space-filter-row">
        <select class="space-filter" @change="${this._onSpaceFilterChange}" .value="${this._spaceFilter}">
          <option value="">All Spaces</option>
          ${tree.spaces.map(s => html`<option value="${s.space.id}">${s.space.name}</option>`)}
        </select>
        ${this.showCreate ? html`
          <button class="create-space-btn" @click="${this._handleCreateSpace}" title="Create Space" aria-label="Create Space">+</button>
        ` : nothing}
      </div>
      <div class="channel-list" role="tree" tabindex="0" @keydown="${this._handleTreeKeyDown}">
        ${!this._spaceFilter && tree.ungrouped.length > 0 ? html`
          <ul class="ungrouped">
            ${tree.ungrouped.map(ch => this._renderChannelItem(ch))}
          </ul>
        ` : nothing}
        ${filteredSpaces.map(node => this._renderSpaceGroup(node))}
      </div>
      ${this.showCreate ? html`
        <pages-button class="create-channel-btn" variant="ghost" size="sm" @click="${this.handleCreateChannel}">
          Create Channel
        </pages-button>
      ` : nothing}
      <pages-confirm-dialog class="delete-dialog"
        .open=${!!this._deleteTarget}
        heading="Delete Channel"
        message=${this._deleteTarget ? `Delete channel "${this._deleteTarget.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        confirmVariant="danger"
        @confirm=${this._onDeleteConfirm}
        @cancel=${this._onDeleteCancel}
      ></pages-confirm-dialog>
      <pages-confirm-dialog class="create-dialog"
        .open=${this._showCreateDialog}
        heading="Create Channel"
        message="Enter a name for the new channel."
        confirmLabel="Create"
        confirmVariant="success"
        .showReason=${true}
        @confirm=${this._onCreateConfirm}
        @cancel=${this._onCreateCancel}
      ></pages-confirm-dialog>
      <pages-confirm-dialog class="create-space-dialog"
        .open=${this._showCreateSpaceDialog}
        heading="Create Space"
        message="Enter a name for the new space."
        confirmLabel="Create"
        confirmVariant="success"
        .showReason=${true}
        @confirm=${this._onCreateSpaceConfirm}
        @cancel=${() => { this._showCreateSpaceDialog = false; }}
      ></pages-confirm-dialog>
      <pages-confirm-dialog class="delete-space-dialog"
        .open=${this._showDeleteSpaceDialog}
        heading="Delete Space"
        message=${this._deleteSpaceTarget
          ? `Delete space "${this._deleteSpaceTarget.space.name}"? Its ${this._deleteSpaceTarget.channels.length} channel(s) will move to the top level.`
          : ''}
        confirmLabel="Delete"
        confirmVariant="danger"
        @confirm=${this._onDeleteSpaceConfirm}
        @cancel=${() => { this._deleteSpaceTarget = null; this._showDeleteSpaceDialog = false; }}
      ></pages-confirm-dialog>
      ${this._renderContextMenu()}
    `;
  }

  private _buildTraversalList(): Array<{ type: 'channel'; channel: QhorusChannel } | { type: 'header'; spaceId: string }> {
    if (!this.channelTree) return [];
    const items: Array<{ type: 'channel'; channel: QhorusChannel } | { type: 'header'; spaceId: string }> = [];
    for (const ch of this.channelTree.ungrouped) {
      items.push({ type: 'channel', channel: ch });
    }
    const addSpace = (node: SpaceNode) => {
      items.push({ type: 'header', spaceId: node.space.id });
      if (this._expandedSpaces.has(node.space.id)) {
        for (const ch of node.channels) items.push({ type: 'channel', channel: ch });
        for (const child of node.children) addSpace(child);
      }
    };
    for (const space of this.channelTree.spaces) addSpace(space);
    return items;
  }

  private _handleTreeKeyDown(event: KeyboardEvent) {
    const items = this._buildTraversalList();
    if (items.length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._focusedIndex = Math.min(this._focusedIndex + 1, items.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._focusedIndex = Math.max(this._focusedIndex - 1, 0);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const item = items[this._focusedIndex];
        if (item?.type === 'channel') this.handleChannelClick(item.channel.id);
        else if (item?.type === 'header') this._toggleSpace(item.spaceId);
        break;
      }
    }
  }

  override render() {
    if (this.layout === 'dropdown') {
      const channels = this._dropdownChannels;
      const selected = channels.find(c => c.id === this.selectedChannelId) ?? channels[0];
      const selectedCount = selected?.unreadCount;
      const triggerLabel = selected
        ? (selectedCount ? `${selected.name} (${selectedCount})` : selected.name)
        : '';
      return html`
        <div class="dropdown-wrapper" @click=${(e: Event) => e.stopPropagation()}>
          <pages-button class="dropdown-trigger" variant="ghost"
                  role="combobox"
                  aria-expanded=${this._dropdownOpen}
                  aria-haspopup="listbox"
                  @click=${() => this._toggleDropdown()}
                  @keydown=${this._handleDropdownKeyDown}>
            <span>${triggerLabel}</span>
            <span class="dropdown-arrow">${this._dropdownOpen ? '▲' : '▼'}</span>
          </pages-button>
          ${this._dropdownOpen ? html`
            <ul class="dropdown-panel" role="listbox">
              ${channels.map((channel, index) => {
                const count = channel.unreadCount;
                return html`
                  <li class="dropdown-option ${channel.id === this.selectedChannelId ? 'selected' : ''} ${index === this._focusedIndex ? 'focused' : ''}"
                      role="option"
                      aria-selected=${channel.id === this.selectedChannelId}
                      @click=${() => this._selectDropdownItem(channel.id)}>
                    <span>${channel.name}</span>
                    ${count ? html`<span class="dropdown-count">${count}</span>` : nothing}
                  </li>
                `;
              })}
            </ul>
          ` : nothing}
        </div>
      `;
    }

    if (this.channelTree) {
      return this._renderTree();
    }

    return html`
      <ul class="channel-list" role="list" tabindex="0" @keydown="${this.handleKeyDown}">
        ${this.channels.map(
          (channel, index) => html`
            <li
              class="channel-item ${this.selectedChannelId === channel.id ? 'selected' : ''} ${index === this._focusedIndex ? 'focused' : ''}"
              role="option"
              aria-selected="${this.selectedChannelId === channel.id}"
              @click="${() => this.handleChannelClick(channel.id)}"
            >
              <span class="channel-icon">${this.getChannelIcon(channel.semantic)}</span>
              <span class="channel-name">${channel.name}</span>
              ${channel.unreadCount ? html`<pages-badge variant="neutral" size="sm" label="${channel.unreadCount}"></pages-badge>` : nothing}
              ${this.showDelete ? html`
                <pages-button variant="ghost" size="sm"
                  class="delete-btn"
                  aria-label="Delete channel ${channel.name}"
                  @click="${(e: MouseEvent) => this.handleDeleteClick(e, channel)}"
                >
                  ✕
                </pages-button>
              ` : nothing}
            </li>
          `
        )}
      </ul>
      ${this.showCreate ? html`
        <pages-button class="create-channel-btn" variant="ghost" size="sm" @click="${this.handleCreateChannel}">
          Create Channel
        </pages-button>
      ` : nothing}
      <pages-confirm-dialog class="delete-dialog"
        .open=${!!this._deleteTarget}
        heading="Delete Channel"
        message=${this._deleteTarget ? `Delete channel "${this._deleteTarget.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        confirmVariant="danger"
        @confirm=${this._onDeleteConfirm}
        @cancel=${this._onDeleteCancel}
      ></pages-confirm-dialog>
      <pages-confirm-dialog class="create-dialog"
        .open=${this._showCreateDialog}
        heading="Create Channel"
        message="Enter a name for the new channel."
        confirmLabel="Create"
        confirmVariant="success"
        .showReason=${true}
        @confirm=${this._onCreateConfirm}
        @cancel=${this._onCreateCancel}
      ></pages-confirm-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'blocks-channel-nav': ChannelNavElement;
  }
}
