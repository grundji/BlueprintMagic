/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import {html, LitElement, svg, SVGTemplateResult} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {Marked} from 'marked';
import {markedHighlight} from 'marked-highlight';
// tslint:disable-next-line:ban-malformed-import-paths
import hljs from 'highlight.js';

/** Markdown formatting function with syntax hilighting */
export const marked = new Marked(
  markedHighlight({
    async: true,
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, {language}).value;
    },
  }),
);

const ICON_BUSY = html`<svg
  class="rotating"
  xmlns="http://www.w3.org/2000/svg"
  height="24px"
  viewBox="0 -960 960 960"
  width="24px"
  fill="currentColor">
  <path
    d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z" />
</svg>`;
const ICON_EDIT = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  height="16px"
  viewBox="0 -960 960 960"
  width="16px"
  fill="currentColor">
  <path
    d="M120-120v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm584-528 56-56-56-56-56 56 56 56Z" />
</svg>`;

export enum ChatState {
  IDLE,
  GENERATING,
  THINKING, // Kept for future use
  CODING,
}

enum ChatTab {
  GEMINI,
  JSON,
}

export enum ChatRole {
  USER,
  ASSISTANT,
  SYSTEM,
}

export interface BlueprintNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  inputs: string[];
  outputs: string[];
}

export interface BlueprintConnection {
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
  type: 'exec' | 'data';
}

export interface BlueprintData {
  nodes: BlueprintNode[];
  connections: BlueprintConnection[];
}

const NODE_WIDTH = 200;
const NODE_HEADER_HEIGHT = 30;
const PORT_RADIUS = 6;
const PORT_SPACING = 25;

@customElement('gdm-playground')
export class Playground extends LitElement {
  @query('#anchor') anchor;
  @query('#blueprint-canvas') blueprintCanvas: SVGSVGElement;
  @query('#file-input') fileInput: HTMLInputElement;

  @state() chatState = ChatState.IDLE;
  @state() selectedChatTab = ChatTab.GEMINI;
  @state() inputMessage = '';
  @state() blueprintJsonString = '';
  @state() blueprintData: BlueprintData | null = null;
  @state() messages: HTMLElement[] = [];
  @state() dataHasChanged = true;

  private defaultBlueprint: BlueprintData | null = null;
  private dragging = false;
  private selectedNode: BlueprintNode | null = null;
  private dragOffset = {x: 0, y: 0};

  sendMessageHandler?: CallableFunction;
  resetHandler?: CallableFunction;

  constructor() {
    super();
    // Add document-level listeners for mouse move and up to handle dragging
    document.addEventListener('mousemove', this.handleDragMove.bind(this));
    document.addEventListener('mouseup', this.handleDragEnd.bind(this));
  }

  createRenderRoot() {
    return this;
  }

  setDefaultBlueprint(data: BlueprintData) {
    this.defaultBlueprint = data;
  }

  setBlueprintData(data: BlueprintData) {
    this.blueprintData = data;
    this.blueprintJsonString = JSON.stringify(data, null, 2);
    this.dataHasChanged = false;
  }

  setChatState(state: ChatState) {
    this.chatState = state;
  }

  setInputField(message: string) {
    this.inputMessage = message.trim();
  }

  addMessage(role: string, message: string) {
    const div = document.createElement('div');
    div.classList.add('turn', `role-${role.trim().toLowerCase()}`);

    const thinkingDetails = document.createElement('details');
    thinkingDetails.classList.add('hidden', 'thinking');
    thinkingDetails.setAttribute('open', 'true');
    const thinking = document.createElement('div');
    thinkingDetails.append(thinking);
    div.append(thinkingDetails);

    const text = document.createElement('div');
    text.className = 'text';
    text.innerHTML = message;
    div.append(text);

    this.messages.push(div);
    this.requestUpdate();
    this.scrollToTheEnd();

    return {thinking, text};
  }

  scrollToTheEnd() {
    this.anchor?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }

  async sendMessageAction(message?: string, role?: string) {
    if (this.chatState !== ChatState.IDLE) return;
    this.chatState = ChatState.GENERATING;

    const msg = (message || this.inputMessage).trim();
    if (!message) this.inputMessage = '';
    if (!msg) {
      this.chatState = ChatState.IDLE;
      return;
    }

    const msgRole = role ? role.toLowerCase() : 'user';
    if (msgRole === 'user') this.addMessage(msgRole, msg);

    if (this.sendMessageHandler) {
      await this.sendMessageHandler(
        msg,
        msgRole,
        this.blueprintJsonString,
        this.dataHasChanged,
      );
    }
    this.chatState = ChatState.IDLE;
  }

  private async clearAction() {
    this.setBlueprintData(
      this.defaultBlueprint || {nodes: [], connections: []},
    );
    this.messages = [];
    this.dataHasChanged = true;
    if (this.resetHandler) this.resetHandler();
    this.addMessage('SYSTEM', 'Blueprint cleared.');
    this.requestUpdate();
  }

  private async blueprintEditedAction(jsonString: string) {
    if (this.chatState !== ChatState.IDLE) return;

    this.blueprintJsonString = jsonString;
    this.dataHasChanged = true;
    try {
      const parsedData = JSON.parse(jsonString);
      // Basic validation
      if (parsedData.nodes && parsedData.connections) {
        this.blueprintData = parsedData;
      }
    } catch (e) {
      // Invalid JSON, don't update the visual graph
      console.warn('Invalid JSON in editor');
    }
    this.requestUpdate();
  }

  private async inputKeyDownAction(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      this.sendMessageAction();
    }
  }

  // --- File I/O Logic ---
  private saveAction() {
    if (!this.blueprintJsonString) return;

    const blob = new Blob([this.blueprintJsonString], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'unreal-blueprint.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  private async handleFileLoad(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const fileContent = await file.text();

    try {
      // This will trigger a re-render and update the graph
      this.blueprintEditedAction(fileContent);
      this.addMessage('SYSTEM', `Blueprint loaded from <strong>${file.name}</strong>.`);
    } catch (err) {
      console.error('Error loading or parsing file:', err);
      this.addMessage(
        'ERROR',
        `Failed to load blueprint from <strong>${file.name}</strong>. The file might be corrupted or not a valid blueprint JSON.`,
      );
    }
    input.value = ''; // Reset input to allow loading same file again
  }

  // --- Drag and Drop Logic ---
  private handleDragStart(e: MouseEvent, node: BlueprintNode) {
    e.preventDefault();
    this.selectedNode = node;
    const CTM = this.blueprintCanvas.getScreenCTM();
    this.dragOffset = {
      x: (e.clientX - CTM.e) / CTM.a - node.x,
      y: (e.clientY - CTM.f) / CTM.d - node.y,
    };
    this.dragging = true;
  }

  private handleDragMove(e: MouseEvent) {
    if (this.dragging && this.selectedNode) {
      e.preventDefault();
      const CTM = this.blueprintCanvas.getScreenCTM();
      const newX = (e.clientX - CTM.e) / CTM.a - this.dragOffset.x;
      const newY = (e.clientY - CTM.f) / CTM.d - this.dragOffset.y;
      this.selectedNode.x = Math.round(newX);
      this.selectedNode.y = Math.round(newY);
      this.requestUpdate();
    }
  }

  private handleDragEnd(e: MouseEvent) {
    if (this.dragging) {
      e.preventDefault();
      this.dragging = false;
      this.selectedNode = null;
      // Update the JSON string after dragging is finished
      this.blueprintJsonString = JSON.stringify(this.blueprintData, null, 2);
      this.dataHasChanged = true;
      this.requestUpdate();
    }
  }

  // --- Rendering Logic ---
  private getPortPosition(
    node: BlueprintNode,
    portName: string,
    isInput: boolean,
  ) {
    const portIndex = isInput
      ? node.inputs.indexOf(portName)
      : node.outputs.indexOf(portName);
    const x = isInput ? node.x : node.x + NODE_WIDTH;
    const y = node.y + NODE_HEADER_HEIGHT + PORT_SPACING * (portIndex + 1);
    return {x, y};
  }

  private renderConnections(): SVGTemplateResult[] {
    if (!this.blueprintData) return [];
    return this.blueprintData.connections.map((conn) => {
      const fromNode = this.blueprintData.nodes.find((n) => n.id === conn.from);
      const toNode = this.blueprintData.nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) return svg``;

      const start = this.getPortPosition(fromNode, conn.fromPort, false);
      const end = this.getPortPosition(toNode, conn.toPort, true);
      const c1x = start.x + Math.abs(end.x - start.x) * 0.7;
      const c2x = end.x - Math.abs(end.x - start.x) * 0.7;
      const pathData = `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`;

      return svg`<path d=${pathData} class="connection-path connection-path-${conn.type}" />`;
    });
  }

  private renderNodes(): SVGTemplateResult[] {
    if (!this.blueprintData) return [];
    return this.blueprintData.nodes.map((node) => {
      const nodeHeight =
        NODE_HEADER_HEIGHT +
        Math.max(node.inputs.length, node.outputs.length) * PORT_SPACING +
        10;
      const headerClasses = {
        'node-header': true,
        [`node-header-${node.type}`]: true,
      };

      return svg`
        <g class="blueprint-node-group" transform="translate(${
          node.x
        }, ${node.y})" @mousedown=${(e: MouseEvent) =>
          this.handleDragStart(e, node)}>
          <rect class="node-body" width=${NODE_WIDTH} height=${nodeHeight} rx="8" />
          <rect class=${classMap(
            headerClasses,
          )} width=${NODE_WIDTH} height=${NODE_HEADER_HEIGHT} />
          <text class="node-label" x="10" y="20">${node.label}</text>
          
          ${node.inputs.map(
            (port, i) => svg`
            <circle class="port port-${
              port.toLowerCase().includes('exec') ? 'exec' : 'data'
            }" cx="0" cy=${
              NODE_HEADER_HEIGHT + PORT_SPACING * (i + 1)
            } r=${PORT_RADIUS} />
            <text class="node-port-label" x="12" y=${
              NODE_HEADER_HEIGHT + PORT_SPACING * (i + 1) + 4
            }>${port}</text>
          `,
          )}
          
          ${node.outputs.map(
            (port, i) => svg`
            <circle class="port port-${
              port.toLowerCase().includes('exec') ? 'exec' : 'data'
            }" cx=${NODE_WIDTH} cy=${
              NODE_HEADER_HEIGHT + PORT_SPACING * (i + 1)
            } r=${PORT_RADIUS} />
            <text class="node-port-label" text-anchor="end" x=${
              NODE_WIDTH - 12
            } y=${
              NODE_HEADER_HEIGHT + PORT_SPACING * (i + 1) + 4
            }>${port}</text>
          `,
          )}
        </g>
      `;
    });
  }

  render() {
    const maxCoords =
      this.blueprintData?.nodes.reduce(
        (acc, node) => ({
          x: Math.max(acc.x, node.x + NODE_WIDTH + 50),
          y: Math.max(acc.y, node.y + 200),
        }),
        {x: 800, y: 600},
      ) || {x: 800, y: 600};

    return html`<div class="playground">
      <div class="sidebar">
        <div class="selector">
          <button
            id="geminiTab"
            class=${classMap({active: this.selectedChatTab === ChatTab.GEMINI})}
            @click=${() => (this.selectedChatTab = ChatTab.GEMINI)}>
            Gemini
          </button>
          <button
            id="jsonTab"
            class=${classMap({active: this.selectedChatTab === ChatTab.JSON})}
            @click=${() => (this.selectedChatTab = ChatTab.JSON)}>
            JSON ${this.dataHasChanged ? ICON_EDIT : ''}
          </button>
        </div>
        <div
          id="chat"
          class=${classMap({
            tabcontent: true,
            showtab: this.selectedChatTab === ChatTab.GEMINI,
          })}>
          <div class="chat-messages">${this.messages}<div id="anchor"></div></div>
          <div class="footer">
            <div
              id="chatStatus"
              class=${classMap({hidden: this.chatState === ChatState.IDLE})}>
              ${this.chatState !== ChatState.IDLE
                ? html`${ICON_BUSY} Generating...`
                : ''}
            </div>
            <div id="inputArea">
              <input
                type="text"
                id="messageInput"
                .value=${this.inputMessage}
                @input=${(e: InputEvent) =>
                  (this.inputMessage = (e.target as HTMLInputElement).value)}
                @keydown=${this.inputKeyDownAction}
                placeholder="Describe the blueprint logic..."
                autocomplete="off" />
              <button
                id="sendButton"
                class=${classMap({disabled: this.chatState !== ChatState.IDLE})}
                @click=${() => this.sendMessageAction()}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="30px"
                  viewBox="0 -960 960 960"
                  width="30px"
                  fill="currentColor">
                  <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div
          id="editor"
          class=${classMap({
            tabcontent: true,
            showtab: this.selectedChatTab === ChatTab.JSON,
          })}>
          <textarea
            .value=${this.blueprintJsonString}
            .readonly=${this.chatState !== ChatState.IDLE}
            @input=${(e: InputEvent) =>
              this.blueprintEditedAction(
                (e.target as HTMLTextAreaElement).value,
              )}></textarea>
        </div>
      </div>

      <div class="main-container">
        <svg id="blueprint-canvas" width=${maxCoords.x} height=${maxCoords.y}>
          <g>${this.renderConnections()}</g>
          <g>${this.renderNodes()}</g>
        </svg>
        <div class="toolbar">
           <input type="file" id="file-input" class="hidden" @change=${
             this.handleFileLoad
           } accept=".json" />
          <button id="load" @click=${() => this.fileInput.click()}>
             <svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor">
                <path d="M440-200h80v-167l64 64 56-57-160-160-160 160 57 57 63-64v167ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Z"/>
             </svg>
            <span>Load</span>
          </button>
           <button id="save" @click=${this.saveAction}>
             <svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="currentColor">
                <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160v440q0 33-23.5 56.5T760-120H200Zm360-560v-160H200v560h560v-400H560q-33 0-56.5-23.5T480-720v-160h80ZM200-800v160-160 560-560Z"/>
             </svg>
            <span>Save</span>
          </button>
          <button id="clear" @click=${this.clearAction}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="30px"
              viewBox="0 -960 960 960"
              width="30px"
              fill="currentColor">
              <path
                d="m376-300 104-104 104 104 56-56-104-104 104-104-56-56-104 104-104-104-56 56 104 104-104 104 56 56Zm-96 180q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Z" />
            </svg>
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>`;
  }
}
