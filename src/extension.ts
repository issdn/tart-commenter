import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import path from 'path';
import * as vscode from 'vscode';
import { NavigationResponse } from './types';

const classNames = new Map<string, string>();

let analysisServer: ChildProcessWithoutNullStreams;
let requestId = 0;

function sendRequest(
  method: string,
  params: {
    included?: string[];
    excluded?: never[];
    file?: string;
    offset?: number;
    length?: number;
  }
) {
  const request = {
    id: (++requestId).toString(),
    method: method,
    params: params,
  };

  analysisServer.stdin.write(JSON.stringify(request) + '\n');
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, '');
}

function doesAlreadyHaveTemplateComment(
  document: vscode.TextDocument,
  line: number
) {
  let lastLine = Math.max(0, line - 1);
  let text = document.lineAt(lastLine).text;
  while (text.includes('///')) {
    if (text.includes(`{@template`)) {
      return true;
    }
    lastLine--;
    if (lastLine < 0) {
      return false;
    }
    text = document.lineAt(lastLine).text;
  }
  return false;
}

function getPreviousLine(document: vscode.TextDocument, line: number): number {
  let lastLine = Math.max(0, line - 1);
  let text = document.lineAt(lastLine).text;
  while (text.trimStart().startsWith('@')) {
    if (lastLine === 0) {
      return lastLine;
    }
    lastLine--;
    text = document.lineAt(lastLine).text;
  }
  return lastLine + 1;
}

export function activate(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('Please open a Dart file');
    return;
  }

  const filePath = editor.document.fileName;

  const channel = vscode.window.createOutputChannel('Tart Commenter');

  // const config = vscode.workspace.getConfiguration('dart');
  // config.get('sdkPath') as string;

  const dartPath = 'C:/Users/isdn/flutter/bin/dart.bat';

  analysisServer = spawn(dartPath, ['language-server', '--protocol=analyzer'], {
    shell: true,
  });

  const disposable = vscode.commands.registerCommand(
    'tartCommenter.generateComments',
    async () => {
      sendRequest('analysis.setAnalysisRoots', {
        included: [path.dirname(filePath)],
        excluded: [],
      });

      sendRequest('analysis.getNavigation', {
        file: filePath,
        offset: 0,
        length: editor.document.getText().length,
      });
    }
  );

  context.subscriptions.push(disposable);

  analysisServer.stdout.on('data', async (data) => {
    const selectionStartOffset = editor.document.offsetAt(
      editor.selection.start
    );
    const selectedText = editor.document.getText(editor.selection);

    const lines = data
      .toString()
      .split('\n')
      .filter((line: string) => line.trim());

    for (const line of lines) {
      try {
        const response = JSON.parse(line) as NavigationResponse;
        if (
          response.id &&
          response.result &&
          response.result.targets &&
          response.result.regions
        ) {
          const { targets, files } = response.result;

          await editor.edit((editBuilder) => {
            for (const {
              fileIndex,
              offset,
              length,
              startLine,
              kind,
              startColumn,
            } of targets) {
              const file = files[fileIndex];
              if (!file || file.replaceAll('/', '\\') !== filePath) {
                continue;
              }
              const localOffset = offset - selectionStartOffset;
              if (
                localOffset < 0 ||
                localOffset + length > selectedText.length
              ) {
                continue;
              }
              const previousLine = getPreviousLine(
                editor.document,
                startLine - 1
              );
              const name = selectedText.substring(
                localOffset,
                localOffset + length
              );
              if (name && !name.startsWith('_')) {
                if (
                  doesAlreadyHaveTemplateComment(editor.document, previousLine)
                ) {
                  continue;
                }
                const position = new vscode.Position(previousLine, 0);
                if (kind === 'CONSTRUCTOR') {
                  const templateName =
                    classNames.get(name) ?? toSnakeCase(name);
                  editBuilder.insert(
                    position,
                    `/// {@macro ${templateName}}\n`
                  );
                } else {
                  const templateName = toSnakeCase(name);
                  editBuilder.insert(
                    position,
                    `/// {@template ${templateName}}\n/// {@endtemplate}\n`
                  );
                  classNames.set(name, templateName);
                }
              }
            }
          });
        }
      } catch (e) {
        if (e instanceof Error) {
          channel.appendLine(e.toString());
        } else {
          channel.appendLine('Unknown error occurred');
        }
      }
    }
  });
}

export function deactivate() {
  if (analysisServer) {
    analysisServer.kill();
  }
}
