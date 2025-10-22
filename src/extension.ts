import { exec, execFile } from 'child_process';
import * as vscode from 'vscode';
import type { Declaration } from './types';
import path from 'path';
import fs from 'fs';

function relativeFromLib(projectRoot: string, absoluteFile: string): string {
  const rel = path.relative(projectRoot, absoluteFile);
  const libIndex = rel.indexOf('lib\\');
  if (libIndex !== -1) {
    return rel.slice(libIndex);
  }
  return rel;
}

function findExecutableOnPath(name: string): string | null {
  const PATH = process.env.PATH || process.env.Path || '';
  const isWin = process.platform === 'win32';
  const pathext = isWin ? process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM' : '';
  const exts = isWin ? pathext.split(';') : [''];
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    for (const ext of exts) {
      const candidate = path.join(dir, name + (ext || ''));
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // ignore permission errors etc.
      }
    }
  }
  return null;
}

function execCommand(
  dartPath: string,
  fileParam: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(
      `${dartPath} run build_runner build --build-filter="${fileParam}" --delete-conflicting-outputs`,
      { cwd },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString() || err.message));
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    );
  });
}

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
  editor: vscode.TextEditor
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
      const indent = line.text.match(/^\s*/)?.[0] ?? '';

      if (shouldMacro) {
        editBuilder.insert(position, `/// {@macro ${templateName}}\n${indent}`);
      } else {
        editBuilder.insert(
          position,
          `/// {@template ${templateName}}\n${indent}/// {@endtemplate}\n${indent}`
        );
      }
    }
  });
}

export async function activate(context: vscode.ExtensionContext) {
  const dartExec = findExecutableOnPath('dart') ?? 'dart';

  const buildFile = vscode.commands.registerCommand(
    'tartCommenter.buildCurrentFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Please open a Dart file');
        return;
      }

      try {
        const filePath = editor.document.fileName;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          editor.document.uri
        );
        const projectRoot =
          workspaceFolder?.uri.fsPath ?? path.dirname(filePath);

        const relativePath = relativeFromLib(projectRoot, filePath);

        const fileNameChunks = [];
        const pathChunks = relativePath.split('.');
        for (let i = pathChunks.length - 1; i >= 0; i--) {
          fileNameChunks.unshift(pathChunks.pop());
          if (pathChunks[i - 1].includes('\\')) {
            break;
          }
        }

        const pathForDart = `${pathChunks.join('.')}*.${fileNameChunks.join(
          '.'
        )}`;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'tart-commenter: running build_runner',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: 'Building...' });
            const { stderr } = await execCommand(
              dartExec,
              pathForDart,
              projectRoot
            );
            if (stderr) {
              vscode.window.showErrorMessage(`Build failed: ${stderr}`);
            } else {
              vscode.window.showInformationMessage('Build completed');
            }
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Build failed: ${error}`);
      }
    }
  );

  const generateCommands = vscode.commands.registerCommand(
    'tartCommenter.generateComments',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Please open a Dart file');
        return;
      }

      const filePath = editor.document.fileName;

      const exePath = context.asAbsolutePath(
        path.join('dist', 'get_declarations.exe')
      );

      const declarations = await runAnalyzer(exePath, filePath);

      insertCommentForTargets(declarations, editor);
    }
  );

  context.subscriptions.push(generateCommands, buildFile);
}

export function deactivate() {}
