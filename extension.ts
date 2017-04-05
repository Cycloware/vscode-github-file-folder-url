import * as vscode from 'vscode';
import * as  path from 'path';
const parseConfig = require('parse-git-config');
const gitBranch = require('git-branch');
const githubUrlFromGit = require('github-url-from-git');
import * as  copyPaste from 'copy-paste'
import * as  fs from 'fs';

type Uri = vscode.Uri;

const extensionName = 'Github-File-Url';
namespace TYPE {
   export type config = '.git/config';
   export type modules = '.gitmodules';
}
const TYPE = {
   config: '.git/config' as TYPE.config,
   modules: '.gitmodules' as TYPE.modules,
}

export function activate(context: vscode.ExtensionContext) {

   // The command has been defined in the package.json file
   {
      const commandName = 'extension.github-file-folder-url.copyGithubUrlWithSelection';
      context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri: Uri) => {
         executeCommand1(commandName, fileUri, true, false);
      }));
   }
   {
      const commandName = 'extension.github-file-folder-url.copyGithubUrlWithSelection-simple';
      context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri: Uri) => {
         executeCommand1(commandName, fileUri, true, true);
      }));
   }
   {
      const commandName = 'extension.github-file-folder-url.copyGithubUrl';
      context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri: Uri) => {
         executeCommand1(commandName, fileUri, false, false);
      }));
   }
   {
      const commandName = 'extension.github-file-folder-url.copyGithubUrl-simple';
      context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri: Uri) => {
         executeCommand1(commandName, fileUri, false, true);
      }));
   }
   {
      const commandName = 'extension.github-file-folder-url.copyGithubUrlForAllOpenFiles';
      context.subscriptions.push(vscode.commands.registerCommand(commandName, (args) => {
         executeCommandAllTextEditors(commandName, false);
      }));
   }
   {
      const commandName = 'extension.github-file-folder-url.copyGithubUrlForAllOpenFiles-simple';
      context.subscriptions.push(vscode.commands.registerCommand(commandName, (args) => {
         executeCommandAllTextEditors(commandName, true);
      }));
   }
}

function executeCommandAllTextEditors(commandName: string, simpleFormat: boolean) {

   try {
      const workspaceRootPath = vscode.workspace.rootPath;
      const uniquePaths: { [key: string]: vscode.TextDocument } = {};
      const textEditors = vscode.workspace.textDocuments.filter(p => path.isAbsolute(p.fileName));
      if (textEditors.length === 0) {
         let errorMessage = 'No open text editors';
         console.error(errorMessage);
         vscode.window.showWarningMessage(errorMessage);
         return;
      }

      textEditors.forEach(p => {
         uniquePaths[p.fileName] = p;
      });

      const allFilePaths = Object.keys(uniquePaths);

      const allPaths = [];
      const allErrors = [];
      const allWarnings = [];

      for (let filePath in uniquePaths) {
         if (!fs.existsSync(filePath)) {
            const extension = path.extname(filePath);
            const errorMessage = `The file '${filePath}' does not exist locally, so no url was generated.`;
            if (allFilePaths.length > 1) {
               if (extension === '.rendered') {
                  // silently skip this
               } else {
                  allWarnings.push(errorMessage);
               }
            } else {
               allErrors.push(errorMessage);
            }
            continue;
         }
         const result = generateGithubUrl(commandName, workspaceRootPath, filePath, null);
         if (result) {
            switch (result.type) {
               case 'success':
                  {
                     const url = result.url;
                     const relativeFilePath = result.relativePathFromGitRoot;
                     const urlMarkdownLink = simpleFormat ? url : `[${relativeFilePath}](${url})`;
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
      if (allWarnings.length === 0) {
         const combinedMessage = `The following ${allWarnings.length} warnings occured:\n\n${allWarnings.join('\n\n')}`;
         console.log(combinedMessage);
         vscode.window.showErrorMessage(combinedMessage);
      }

      if (allPaths.length > 0) {
         const combindedPaths = allPaths.join('\n');
         copyPaste.copy(combindedPaths);
         return;
      }

      if (allWarnings.length === 0 && allErrors.length === 0) {
         const message = `${extensionName} extension failed to run command '${commandName}'.
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}`;
         console.log(message);
         vscode.window.showErrorMessage(message);
         return;
      }
   }
   catch (e) {
      let errorMessage = `${extensionName} extension failed to execute command '${commandName}'.  See debug console for details.`;
      if (e) {
         errorMessage += `\n\nErr: ${e}`;
      }
      console.log(errorMessage);
      vscode.window.showErrorMessage(errorMessage);
      return;
   }

}

type ILineInfo = { start: number, end: number };
function executeCommand1(commandName: string, fileUri: Uri, pullLines: boolean, simpleFormat: boolean) {
   try {
      const workspaceRootPath = vscode.workspace.rootPath;
      let lineInfo : ILineInfo = null;
      if (pullLines) {
         let editor = vscode.window.activeTextEditor;
         if (editor) {
            lineInfo = {
               start: editor.selection.start.line + 1,
               end: editor.selection.end.line + 1,
            };
         }
      }

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

      const allWarnings = [];
      if (!fs.existsSync(filePath)) {
         // we generate a warning but still generate the url
         const errorMessage = `The file '${filePath}' does not exist locally, so no url was generated.`;
         allWarnings.push(errorMessage);
      }

      const result = generateGithubUrl(commandName, workspaceRootPath, filePath, lineInfo);
      if (result) {
         switch (result.type) {
            case 'success':
               {
                  const url = result.url;
                  const relativeFilePath = result.relativePathFromGitRoot;
                  const urlMarkdownLink = simpleFormat ? url : `[${relativeFilePath}](${url})`;
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
      let errorMessage = `${extensionName} extension failed to execute command '${commandName}'.  See debug console for details.`;
      if (e) {
         errorMessage += `\n\nErr: ${e}`;
      }
      console.log(errorMessage);
      vscode.window.showErrorMessage(errorMessage);
      return;
   }

}

function generateGithubUrl(commandName: string, workspaceRootPath: string, filePath: string, lineSelection: ILineInfo) {
   try {
      workspaceRootPath = workspaceRootPath.replace(/\\/g, '/'); // Flip subdir slashes on Windows
      filePath = filePath.replace(/\\/g, '/'); // Flip subdir slashes on Windows
      const parseResult = findAndParseConfig(filePath);
      if (!parseResult) {
         const errorMessage = `${extensionName} extension failed to find a Github config at the workspace folder or any of it's parent folders.
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}
Filepath:        ${filePath}`;
         return {
            type: 'error' as 'error',
            errorMessage,
         };
      }
      const config = parseResult.config;
      const rootPathForGitConfig = parseResult.rootPath;
      const branch = gitBranch.sync(rootPathForGitConfig);
      const remoteConfig = config[`branch "${branch}"`];
      const remoteName = remoteConfig && remoteConfig.remote ? remoteConfig.remote : 'origin';
      const finalConfig = config[`remote "${remoteName}"`];
      if (finalConfig) {
         let targetUrl = finalConfig.url;
         let targetPath = rootPathForGitConfig;
         for (const sub of parseResult.subModules) {
            if (filePath.search(sub.path) === 0) {
               targetUrl = sub.url;
               targetPath = sub.path;
               break;
            }
         }

         const githubRootUrl = githubUrlFromGit(targetUrl);
         let relativePathFromGitRoot = filePath.substring(rootPathForGitConfig.length).replace(/\\/g, '/'); // Flip subdir slashes on Windows
         let relativeFilePath = filePath.substring(targetPath.length).replace(/\\/g, '/'); // Flip subdir slashes on Windows
         let url = `${githubRootUrl}/blob/${branch}${relativeFilePath}`;
         if (relativePathFromGitRoot[0] === '/') {
            relativePathFromGitRoot = relativePathFromGitRoot.slice(1);
         }
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
            type: 'success' as 'success',
            url,
            relativeFilePath,
            relativePathFromGitRoot,
         }
      } else {
         let errorMessage = `${extensionName} extension failed to find a remote config for "${remoteName}" in branch "${branch}".
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}
Filepath:        ${filePath}`;
         return {
            type: 'error' as 'error',
            errorMessage,
         };
      }
   }
   catch (e) {
      let errorMessage = `${extensionName} extension failed to run 'generateGithubUrl' due to an unhandled error.  See debug console for details.`;
      if (e) {
         errorMessage += `\n\nErr: ${e}`;
      }
      return {
         type: 'error' as 'error',
         errorMessage,
      };
   }
}

const reSubModulePuller = /"([^"]*)"/g;

function findAndParseConfig(rootPath: string) {
   function intParseGitConfig(cwd: string) {
      let ret = parseConfig.sync({ cwd: cwd, path: TYPE.config });
      if (!(Object.keys(ret).length === 0 && ret.constructor === Object)) {
         return ret;
      }
   }
   function intParseModuleConfig(cwd: string) {
      let ret = parseConfig.sync({ cwd: cwd, path: TYPE.modules });
      if (!(Object.keys(ret).length === 0 && ret.constructor === Object)) {
         return ret;
      }
   }

   rootPath = rootPath.replace(/\\/g, '/'); // Flip subdir slashes on Windows
   const pathParts = rootPath.split('/');
   let subModuleConfigs = [];
   let subModules: IModuleInfo[] = [];
   let stepsUp = 0;
   while (pathParts.length > 0) {
      let currentPath = pathParts.join('/');
      let gitConfig = intParseGitConfig(currentPath);
      function pullSubModules(subMeta: IRootOrModuleMeta): IModuleInfo[] {
         const config = subMeta.config;
         const ret = [];
         for (const key in config) {
            const match1 = reSubModulePuller.exec(key);
            if (match1 && match1.length === 2) {
               const subConfig = config[key];
               const subUrl = subConfig.url;
               const modName = match1[1];
               const modFullpath = path.join(currentPath, modName).replace(/\\/g, '/');
               if (!subUrl) {
                  console.warn(`subModule '${modName}' at '${modFullpath}' is missing a url, it will be skipped`);
               } else {
                  const metaInfo = {
                     path: modFullpath,
                     name: modName,
                     url: subUrl,
                  };
                  subModules.push(metaInfo);
                  ret.push(metaInfo);
               }
            }
         }
         return ret;
      }
      if (gitConfig) {

         const pathMap = [];
         for (const sub of subModuleConfigs) {
            const subRoot = sub.path;
            // const fullModulePath = path.join(sub.)).replace(/\\/g, '/')
            // pathMap
         }

         const rootMeta: IRootMeta = {
            type: TYPE.config,
            rootPath: currentPath,
            path: currentPath,
            config: gitConfig,
            stepsUp,
         };
         const subs = pullSubModules(rootMeta);
         rootMeta.subs = subs;

         rootMeta.subModules = subModules;

         return rootMeta;
      } else {
         let moduleConfig = intParseModuleConfig(currentPath);
         if (moduleConfig) {
            const subMeta: IModuleMeta = {
               type: TYPE.modules,
               path: currentPath,
               config: moduleConfig,
               stepsUp,
            };
            const subs = pullSubModules(subMeta);
            subMeta.subs = subs;
            subModuleConfigs.push(subMeta);
         }
      }
      stepsUp++;
      pathParts.pop();
   }
}

type IModuleInfo = {
   path: string,
   name: string,
   url: any,
};
type IModuleMeta = {
   type: TYPE.modules,
   path: string,
   config: any,
   subs?: IModuleInfo[],
   stepsUp: number,
}
type IRootMeta = {
   type: TYPE.config,
   rootPath: string,
   path: string,
   config: any,
   stepsUp: number,
   subs?: IModuleInfo[],
   subModules?: any,
}

type IRootOrModuleMeta = IModuleMeta | IRootMeta;