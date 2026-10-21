import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as mammoth from 'mammoth';

export class DocxEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'docx-viewer.editor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new DocxEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      DocxEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => {},
    };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'ready') {
        await this.updateContent(document.uri, webviewPanel.webview);
      }
    });

    const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
    watcher.onDidChange(() => {
      this.updateContent(document.uri, webviewPanel.webview);
    });
    webviewPanel.onDidDispose(() => watcher.dispose());
  }

  private async updateContent(uri: vscode.Uri, webview: vscode.Webview): Promise<void> {
    try {
      const html = await this.convertDocxToHtml(uri);
      webview.postMessage({
        type: 'content',
        html,
      });
    } catch (error) {
      webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async convertDocxToHtml(uri: vscode.Uri): Promise<string> {
    const buffer = fs.readFileSync(uri.fsPath);
    const result = await mammoth.convertToHtml({ buffer });
    return result.value;
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    :root {
      --paper-bg: #ffffff;
      --paper-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      --text-color: #1a1a1a;
      --muted-color: #666666;
      --link-color: #0066cc;
      --border-color: #e0e0e0;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 24px;
      background-color: #f0f0f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: var(--text-color);
      line-height: 1.6;
    }

    .paper {
      max-width: 816px;
      margin: 0 auto;
      padding: 96px;
      background-color: var(--paper-bg);
      box-shadow: var(--paper-shadow);
      min-height: calc(100vh - 48px);
    }

    @media (max-width: 900px) {
      .paper {
        padding: 40px;
      }
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      color: var(--muted-color);
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error {
      display: none;
      text-align: center;
      padding: 40px;
      color: #d32f2f;
    }

    .content {
      display: none;
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.3;
    }

    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1.1em; }
    h5 { font-size: 1em; }
    h6 { font-size: 0.9em; }

    p {
      margin-top: 0;
      margin-bottom: 1em;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1em;
    }

    th, td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background-color: #f5f5f5;
      font-weight: 600;
    }

    ul, ol {
      padding-left: 2em;
      margin-bottom: 1em;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    a {
      color: var(--link-color);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    blockquote {
      border-left: 4px solid var(--border-color);
      padding-left: 1em;
      margin-left: 0;
      color: var(--muted-color);
    }
  </style>
</head>
<body>
  <div class="paper">
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Loading document...</p>
    </div>
    <div class="content" id="content"></div>
    <div class="error" id="error">
      <h2>Error loading document</h2>
      <p id="error-message"></p>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      vscode.postMessage({ type: 'ready' });

      window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
          case 'content':
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').innerHTML = message.html;
            document.getElementById('content').style.display = 'block';
            break;
          case 'error':
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error-message').textContent = message.message;
            document.getElementById('error').style.display = 'block';
            break;
        }
      });
    })();
  </script>
</body>
</html>`;
  }
}
