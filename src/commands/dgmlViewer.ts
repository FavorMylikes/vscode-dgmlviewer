
var fs = require('fs');
import path = require('path');
import * as vscode from 'vscode';
import { Base64 } from 'js-base64';

import { Config, DgmlParser, FileSystemUtils } from '@src';
import { IDirectedGraph } from '@model';

export class DgmlViewer {

  private static readonly _name: string = 'dgmlViewer';
  private extensionContext: vscode.ExtensionContext;
  private config = new Config();
  private fsUtils = new FileSystemUtils();
  private directedGraph: IDirectedGraph | undefined;
  public static get commandName(): string { return DgmlViewer._name; }

  constructor(context: vscode.ExtensionContext) {
    this.extensionContext = context;
  }

  public execute(webview: vscode.Webview): void {

    webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'saveAsPng':
            this.saveAsPng(message.text);
            return;
          case 'openFile':
            const filename = message.text;
            if (this.fsUtils.fileExists(filename)) {
              var openPath = vscode.Uri.parse("file:///" + filename);
              vscode.workspace.openTextDocument(openPath).then(doc => {
                vscode.window.showTextDocument(doc);
              });
            }
            return;
          case 'nodeCoordinateUpdate':
            if (this.directedGraph !== undefined) {
              const nodeId = message.text.nodeId;
              const position = message.text.position;
              const node = this.directedGraph.nodes.find(node => node.id === nodeId);
              if (node !== undefined) {
                node.boundsX = position.x;
                node.boundsY = position.y;
                this.generateAndWriteJavascriptFile(() => { });
              }
            }
            return;
        }
      },
      undefined,
      this.extensionContext.subscriptions
    );

    if (vscode.window.activeTextEditor !== undefined) {
      let doc = vscode.window.activeTextEditor.document;
      if (doc.fileName.toLowerCase().endsWith('.dgml')) {
        const dgmlParser = new DgmlParser();
        this.directedGraph = dgmlParser.parseDgmlFile(doc.fileName, this.config);
        const outputJsFilename = DgmlViewer._name + '.js';
        let htmlContent = this.generateHtmlContent(webview, outputJsFilename);
        this.generateAndWriteJavascriptFile(() => {
          webview.html = htmlContent;
        });
      }
    }
  }

  private generateAndWriteJavascriptFile(callbackFunction: () => void) {
    if (this.directedGraph !== undefined) {
      const nodesJson = this.directedGraph.nodes
        .map((node, index, arr) => { return node.toJsString(); })
        .join(',\n');
      const edgesJson = this.directedGraph.links
        .map((link, index, arr) => { return link.toJsString(); })
        .join(',\n');
      const jsContent = this.generateJavascriptContent(nodesJson, edgesJson);
      const outputJsFilename = DgmlViewer._name + '.js';
      try {
        this.fsUtils.writeFile(this.extensionContext?.asAbsolutePath(path.join('.', outputJsFilename)), jsContent, callbackFunction);
      } catch (ex) {
        console.log('Dgml Viewer Exception:' + ex);
      }
    }
  }

  private generateJavascriptContent(nodesJson: string, edgesJson: string): string {
    const templateJsFilename = DgmlViewer._name + '_Template.js';
    let template = fs.readFileSync(this.extensionContext?.asAbsolutePath(path.join('templates', templateJsFilename)), 'utf8');
    let jsContent = template.replace('var nodeElements = [];', `var nodeElements = [${nodesJson}];`);
    jsContent = jsContent.replace('var edgeElements = [];', `var edgeElements = [${edgesJson}];`);
    jsContent = jsContent.replace('background: "#D2E5FF" // nodes default background color', `background: "${this.config.defaultNodeBackgroundColor}" // nodes default background color`);
    jsContent = jsContent.replace('\'shape\': \'round-rectangle\' // The shape of the nodes.', `shape: '${this.config.nodeShape}'// The shape of the nodes.`);
    jsContent = jsContent.replace('const edgeArrowType = \'triangle\' // edge arrow to type', `const edgeArrowType = \'${this.config.edgeArrowToType}\' // edge arrow to type}`);
    jsContent = jsContent.replace('ctx.strokeStyle = \'blue\'; // graph selection guideline color', `ctx.strokeStyle = '${this.config.graphSelectionGuidelineColor}'; // graph selection guideline color`);
    jsContent = jsContent.replace('ctx.lineWidth = 1; // graph selection guideline width', `ctx.lineWidth = ${this.config.graphSelectionGuidelineWidth}; // graph selection guideline width`);
    jsContent = jsContent.replace('selectionCanvasContext.strokeStyle = \'red\';', `selectionCanvasContext.strokeStyle = '${this.config.graphSelectionColor}';`);
    jsContent = jsContent.replace('selectionCanvasContext.lineWidth = 2;', `selectionCanvasContext.lineWidth = ${this.config.graphSelectionWidth};`);
    jsContent = jsContent.replace("const defaultLayout = ''; // The graph layout from the dgml file itself", `const defaultLayout = '${this.config.defaultLayout}'; // The graph layout from the dgml file itself`);
    return jsContent;
  }

  private generateHtmlContent(webview: vscode.Webview, outputJsFilename: string): string {
    const templateHtmlFilename = DgmlViewer._name + '_Template.html';
    let htmlContent = fs.readFileSync(this.extensionContext?.asAbsolutePath(path.join('templates', templateHtmlFilename)), 'utf8');

    const cytoscapeMinJs = 'cytoscape.min.js';
    const cytoscapePath = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'javascript', cytoscapeMinJs);
    const cytoscapeUri = webview.asWebviewUri(cytoscapePath);
    htmlContent = htmlContent.replace(cytoscapeMinJs, cytoscapeUri.toString());

    const cssPath = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'stylesheets', DgmlViewer._name + '.css');
    const cssUri = webview.asWebviewUri(cssPath);
    htmlContent = htmlContent.replace(DgmlViewer._name + '.css', cssUri.toString());

    const nonce = this.getNonce();
    htmlContent = htmlContent.replace('nonce-nonce', `nonce-${nonce}`);
    htmlContent = htmlContent.replace(/<script /g, `<script nonce="${nonce}" `);
    htmlContent = htmlContent.replace('cspSource', webview.cspSource);

    const jsPath = vscode.Uri.joinPath(this.extensionContext.extensionUri, outputJsFilename);
    const jsUri = webview.asWebviewUri(jsPath);
    htmlContent = htmlContent.replace(DgmlViewer._name + '.js', jsUri.toString());
    return htmlContent;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private saveAsPng(messageText: string) {
    const dataUrl = messageText.split(',');
    if (dataUrl.length > 0) {
      const u8arr = Base64.toUint8Array(dataUrl[1]);

      const workspaceDirectory = this.fsUtils.getWorkspaceFolder();
      const newFilePath = path.join(workspaceDirectory, this.config.dgmlViewerPngFilename);
      this.fsUtils.writeFile(newFilePath, u8arr, () => { });

      vscode.window.showInformationMessage(`The file ${this.config.dgmlViewerPngFilename} has been created in the root of the workspace.`);
    }
  }

}