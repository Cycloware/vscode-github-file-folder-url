"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const path = require('path');
const parseConfig = require('parse-git-config');
const gitBranch = require('git-branch');
const githubUrlFromGit = require('github-url-from-git');
const copyPaste = require("copy-paste");

const extensionName = 'Github-File-Url';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {

   // The command has been defined in the package.json file
   const commandName1 = 'extension.github-file-folder-url.copyGithubUrlWithSelection';
   context.subscriptions.push(vscode.commands.registerCommand(commandName1, (fileUri) => {
      executeCommand1(commandName1, fileUri, true);
   }));
   const commandName2 = 'extension.github-file-folder-url.copyGithubUrl';
   context.subscriptions.push(vscode.commands.registerCommand(commandName2, (fileUri) => {
      executeCommand1(commandName2, fileUri, false);
   }));
   const commandName3 = 'extension.github-file-folder-url.copyGithubUrlForAllOpenFiles';
   context.subscriptions.push(vscode.commands.registerCommand(commandName3, () => {
      executeCommandAllTextEditors(commandName3);
   }));
}

function executeCommandAllTextEditors(commandName) {

   try {
      const workspaceRootPath = vscode.workspace.rootPath;
      const uniquePaths = {};
      const textEditors = vscode.workspace.textDocuments.filter(p => path.isAbsolute(p.fileName));
      if (textEditors.length === 0) {
         let errorMessage = 'No open text editors';
         console.error(errorMessage);
         vscode.window.showWarningMessage(errorMessage);
         return;
      }

      textEditors.forEach(p=> uniquePaths[p.fileName] = true);      

      const allPaths = [];
      const allErrors = [];

      for (let filePath in uniquePaths) {
         const result = generateGithubUrl(commandName, workspaceRootPath, filePath, null);
         if (result) {
            switch (result.type) {
               case 'success':
                  {
                     const url = result.url;
                     const relativeFilePath = result.relativeFilePath;
                     const urlMarkdownLink = `[${relativeFilePath}](${url})`;
                     allPaths.push(urlMarkdownLink);
                  }
                  break;

               case 'error':
                  {
                     const errorMessage = result.errorMessage;
                     allErrors.push(errorMessage);
                  }
                  break;
            }
         }
      }

      if (allErrors.length > 0) {
         const combinedMessage = `The following ${allErrors.length} errors occured:\n\n${allErrors.join('\n\n')}`;
         console.log(combinedMessage);
         vscode.window.showErrorMessage(combinedMessage);
      }

      if (allPaths.length > 0) {
         const combindedPaths = allPaths.join('\n');
         copyPaste.copy(combindedPaths);
         return;
      }

      if (allErrors.length === 0) {
         const errorMessage = `${extensionName} extension failed to run command '${commandName}'.
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}`;
         console.log(errorMessage);
         vscode.window.showErrorMessage(errorMessage);
         return;
      }
   }
   catch (e) {
      const errorMessage = `${extensionName} extension failed to execute command '${commandName}'.  See debug console for details.`;
      if (e.name && e.message) {
         errorMessage += `\n\n(${extensionName}) ${e.name}: ${e.message}`
      };
      console.log(errorMessage);
      vscode.window.showErrorMessage(errorMessage);
      return;
   }

}
function executeCommand1(commandName, fileUri, pullLines) {
   try {
      const workspaceRootPath = vscode.workspace.rootPath;
      const lineInfo = pullLines ? {
         start: editor.selection.start.line + 1,
         end: editor.selection.end.line + 1,
      } : null;

      let filePath;
      if (fileUri && fileUri.fsPath) {
         filePath = fileUri.fsPath;
      }

      if (!filePath) {
         const editor = vscode.window.activeTextEditor;
         if (!editor) {
            let errorMessage = 'No open text editor';
            console.error(errorMessage);
            vscode.window.showWarningMessage(errorMessage);
            return;
         }
         filePath = editor.document.fileName;
      }

      const result = generateGithubUrl(commandName, workspaceRootPath, filePath, lineInfo);
      if (result) {
         switch (result.type) {
            case 'success':
               {
                  const url = result.url;
                  const relativeFilePath = result.relativeFilePath;
                  const urlMarkdownLink = `[${relativeFilePath}](${url})`;
                  copyPaste.copy(urlMarkdownLink);
               }
               return;

            case 'error':
               {
                  const errorMessage = result.errorMessage;
                  console.log(errorMessage);
                  vscode.window.showErrorMessage(errorMessage);
               }
               return;
         }

      }

      {
         const errorMessage = `${extensionName} extension failed to run command '${commandName}'.
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}`;
         console.log(errorMessage);
         vscode.window.showErrorMessage(errorMessage);
         return;
      }
   }
   catch (e) {
      const errorMessage = `${extensionName} extension failed to execute command '${commandName}'.  See debug console for details.`;
      if (e.name && e.message) {
         errorMessage += `\n\n(${extensionName}) ${e.name}: ${e.message}`
      };
      console.log(errorMessage);
      vscode.window.showErrorMessage(errorMessage);
      return;
   }

}

function generateGithubUrl(commandName, workspaceRootPath, filePath, lineSelection) {
   try {
      const parseResult = findAndParseConfig(workspaceRootPath);
      if (!parseResult) {
         const errorMessage = `${extensionName} extension failed to find a Github config at the workspace folder or any of it's parent folders.
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}`;
         return {
            type: 'error',
            errorMessage,
         };
      }
      const config = parseResult.config;
      const cwd = parseResult.rootPath;
      const branch = gitBranch.sync(cwd);
      const remoteConfig = config[`branch "${branch}"`];
      const remoteName = remoteConfig && remoteConfig.remote ? remoteConfig.remote : 'origin';
      const finalConfig = config[`remote "${remoteName}"`];
      if (finalConfig) {
         const githubRootUrl = githubUrlFromGit(finalConfig.url);
         let relativeFilePath = filePath.substring(cwd.length).replace(/\\/g, '/'); // Flip subdir slashes on Windows
         let url = `${githubRootUrl}/blob/${branch}${relativeFilePath}`;
         if (relativeFilePath[0] === '/') {
            relativeFilePath = relativeFilePath.slice(1);
         }
         url = url.replace(/\\/g, '/'); // Flip subdir slashes on Windows
         if (lineSelection) {
            const lineStart = +lineSelection.start;
            if (lineStart >= 0) {
               url += `#L${lineStart}`;
               const lineEnd = +lineSelection.end;
               if (lineEnd > lineStart) {
                  url += `-L${lineEnd}`
               }
            }
         }
         return {
            type: 'success',
            url,
            relativeFilePath,
         }
      } else {
         let errorMessage = `${extensionName} extension failed to find a remote config for "${remoteName}" in branch "${branch}".
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}`;
         return {
            type: 'error',
            errorMessage,
         };
      }
   }
   catch (e) {
      let errorMessage = `${extensionName} extension failed to run 'generateGithubUrl' due to an unhandled error.  See debug console for details.`;
      if (e.name && e.message) {
         errorMessage += `\n\n(${extensionName}) ${e.name}: ${e.message}`
      };
      return {
         type: 'error',
         errorMessage,
      };
   }
}

function findAndParseConfig(rootPath) {
   function intParseConfig(cwd) {
      let ret = parseConfig.sync({ cwd: cwd, path: '.git/config' });
      if (!(Object.keys(ret).length === 0 && ret.constructor === Object)) {
         return ret;
      }
   }

   rootPath = rootPath.replace(/\\/g, '/'); // Flip subdir slashes on Windows
   const pathParts = rootPath.split('/');
   let stepsUp = 0;
   while (pathParts.length > 0) {
      let currentPath = pathParts.join('/');
      let config = intParseConfig(currentPath);
      if (config) {
         return {
            rootPath: currentPath,
            config,
            stepsUp
         };
      }
      stepsUp++;
      pathParts.pop();
   }
}
exports.activate = activate;
