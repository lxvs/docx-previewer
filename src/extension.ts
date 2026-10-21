import * as vscode from 'vscode';
import { DocxEditorProvider } from './docxEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(DocxEditorProvider.register(context));
}

export function deactivate(): void {}
