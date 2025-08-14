import { ChildProcessWithoutNullStreams, exec, spawn } from 'child_process';
import path from 'path';
import * as vscode from 'vscode';
import { NavigationResponse } from './types';
import { homedir } from 'os';

const classNames = new Map<string, string>();

let analysisServer: ChildProcessWithoutNullStreams;
let analysisServerConnected = false;
let requestId = 0;

let serverConnection: Promise<void>;

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

async function sendRequestWithSpinner(
  method: string,
  params: any
): Promise<any> {
  if (!analysisServerConnected) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Tart: Waiting for analysis server to connect...',
        cancellable: false,
      },
      async () => {
        await serverConnection;
      }
    );
  }
  sendRequest(method, params);
  return new Promise((resolve) => {
    const handler = (data: Buffer) => {
      analysisServer.stdout?.off('data', handler);
      resolve(data.toString());
    };
    analysisServer.stdout?.on('data', handler);
  });
}

async function getPathFromWhere() {
  return new Promise<string>((resolve, reject) => {
    exec('where dart', (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim().split(/\r?\n/).at(-1)!);
    });
  });
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

function insertComment(
  kind: string,
  name: string,
  editBuilder: vscode.TextEditorEdit,
  position: vscode.Position
) {
  if (kind === 'CONSTRUCTOR') {
    const templateName = classNames.get(name) ?? toSnakeCase(name);
    editBuilder.insert(position, `/// {@macro ${templateName}}\n`);
  } else {
    const templateName = toSnakeCase(name);
    editBuilder.insert(
      position,
      `/// {@template ${templateName}}\n/// {@endtemplate}\n`
    );
    classNames.set(name, templateName);
  }
}

async function insertCommentForTargets(
  result: Required<NavigationResponse>['result'],
  editor: vscode.TextEditor,
  filePath: string,
  selectionStartOffset: number,
  selectedText: string
) {
  const { targets, files } = result;

  await editor.edit((editBuilder) => {
    for (const { fileIndex, offset, length, startLine, kind } of targets) {
      const file = files[fileIndex];
      if (!file || file.replaceAll('/', '\\') !== filePath) {
        continue;
      }
      const localOffset = offset - selectionStartOffset;
      if (localOffset < 0 || localOffset + length > selectedText.length) {
        continue;
      }
      const previousLine = getPreviousLine(editor.document, startLine - 1);
      const name = selectedText.substring(localOffset, localOffset + length);
      if (name && !name.startsWith('_')) {
        if (doesAlreadyHaveTemplateComment(editor.document, previousLine)) {
          continue;
        }
        const position = new vscode.Position(previousLine, 0);
        insertComment(kind, name, editBuilder, position);
      }
    }
  });
}

export async function activate(context: vscode.ExtensionContext) {
  if (!analysisServer) {
    const config = vscode.workspace.getConfiguration('dart');
    const configSdkPathValue = config.get('sdkPath') as string | undefined;
    let sdkPath = configSdkPathValue
      ? path.join(configSdkPathValue, 'bin', 'dart.bat')
      : undefined;

    sdkPath ??= path.join(homedir(), 'flutter', 'bin', 'dart.bat');
    sdkPath ??= await getPathFromWhere();

    analysisServer = spawn(
      sdkPath,
      ['language-server', '--protocol=analyzer'],
      {
        shell: true,
      }
    );

    serverConnection = (async () => {
      await new Promise<void>((resolve) => {
        const handler = () => {
          analysisServerConnected = true;
          resolve();
        };
        analysisServer.stdout?.once('data', handler);
      });
    })();
  }

  const disposable = vscode.commands.registerCommand(
    'tartCommenter.generateComments',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Please open a Dart file');
        return;
      }

      const filePath = editor.document.fileName;

      analysisServer.stdout.on('data', async (data) => {
        analysisServerConnected = true;
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
              await insertCommentForTargets(
                response.result,
                editor,
                filePath,
                selectionStartOffset,
                selectedText
              );
            }
          } catch (e) {
            const channel = vscode.window.createOutputChannel('Tart Commenter');
            if (e instanceof Error) {
              channel.appendLine(e.toString());
            } else {
              channel.appendLine('Unknown error occurred');
            }
          }
        }
      });

      sendRequest('analysis.setAnalysisRoots', {
        included: [path.dirname(filePath)],
        excluded: [],
      });

      await sendRequestWithSpinner('analysis.getNavigation', {
        file: filePath,
        offset: 0,
        length: editor.document.getText().length,
      });
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {
  if (analysisServer) {
    analysisServer.kill();
  }
}
