import { execFile } from 'child_process';
import * as vscode from 'vscode';
import type { Declaration } from './types';
import path from 'path';

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, '');
}

function runAnalyzer(exePath: string, filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(exePath, [filePath], (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Analyzer failed: ${stderr || err}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.toString());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse analyzer output: ${e}`));
      }
    });
  });
}

async function insertCommentForTargets(
  declarations: Declaration[],
  editor: vscode.TextEditor,
) {
  const selection = editor.selection;
  const doc = editor.document;

  const selectionStart = doc.offsetAt(selection.start);
  const selectionEnd = doc.offsetAt(selection.end);

  await editor.edit((editBuilder) => {
    for (const { name, shouldMacro, offset } of declarations) {
      if (selection && !selection.isEmpty) {
        if (offset < selectionStart || offset > selectionEnd) {
          continue;
        }
      }

      const templateName = toSnakeCase(name);
      const position = doc.positionAt(offset);
      const line = doc.lineAt(position.line);
      const indent = line.text.match(/^\s*/)?.[0] ?? "";

      if (shouldMacro) {
        editBuilder.insert(position, `/// {@macro ${templateName}}\n${indent}`);

      } else {
        editBuilder.insert(position, `/// {@template ${templateName}}\n${indent}/// {@endtemplate}\n${indent}`);
      }
    }
  });
}

export async function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'tartCommenter.generateComments',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Please open a Dart file');
        return;
      }

      const filePath = editor.document.fileName;

      const exePath = context.asAbsolutePath(
        path.join("dist", "get_declarations.exe")
      );

      const declarations = await runAnalyzer(exePath, filePath);

      insertCommentForTargets(declarations, editor);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() { }
