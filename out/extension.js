"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const parseConfig = require('parse-git-config');
const gitBranch = require('git-branch');
const githubUrlFromGit = require('github-url-from-git');
const copyPaste = require("copy-paste");
const fs = require("fs");
const extensionName = 'Github-File-Url';
const TYPE = {
    config: '.git/config',
    modules: '.gitmodules',
};
function activate(context) {
    // The command has been defined in the package.json file
    {
        const commandName = 'extension.github-file-folder-url.copyGithubUrlWithSelection';
        context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri) => {
            executeCommand1(commandName, fileUri, true, false);
        }));
    }
    {
        const commandName = 'extension.github-file-folder-url.copyGithubUrlWithSelection-simple';
        context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri) => {
            executeCommand1(commandName, fileUri, true, true);
        }));
    }
    {
        const commandName = 'extension.github-file-folder-url.copyGithubUrl';
        context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri) => {
            executeCommand1(commandName, fileUri, false, false);
        }));
    }
    {
        const commandName = 'extension.github-file-folder-url.copyGithubUrl-simple';
        context.subscriptions.push(vscode.commands.registerCommand(commandName, (fileUri) => {
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
exports.activate = activate;
function executeCommandAllTextEditors(commandName, simpleFormat) {
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
                    }
                    else {
                        allWarnings.push(errorMessage);
                    }
                }
                else {
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
function executeCommand1(commandName, fileUri, pullLines, simpleFormat) {
    try {
        const workspaceRootPath = vscode.workspace.rootPath;
        let lineInfo = null;
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
function generateGithubUrl(commandName, workspaceRootPath, filePath, lineSelection) {
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
                type: 'error',
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
                        url += `-L${lineEnd}`;
                    }
                }
            }
            return {
                type: 'success',
                url,
                relativeFilePath,
                relativePathFromGitRoot,
            };
        }
        else {
            let errorMessage = `${extensionName} extension failed to find a remote config for "${remoteName}" in branch "${branch}".
Is this a Github repository?

Workspace Root:  ${workspaceRootPath}
Filepath:        ${filePath}`;
            return {
                type: 'error',
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
            type: 'error',
            errorMessage,
        };
    }
}
const reSubModulePuller = /"([^"]*)"/g;
function findAndParseConfig(rootPath) {
    function intParseGitConfig(cwd) {
        let ret = parseConfig.sync({ cwd: cwd, path: TYPE.config });
        if (!(Object.keys(ret).length === 0 && ret.constructor === Object)) {
            return ret;
        }
    }
    function intParseModuleConfig(cwd) {
        let ret = parseConfig.sync({ cwd: cwd, path: TYPE.modules });
        if (!(Object.keys(ret).length === 0 && ret.constructor === Object)) {
            return ret;
        }
    }
    rootPath = rootPath.replace(/\\/g, '/'); // Flip subdir slashes on Windows
    const pathParts = rootPath.split('/');
    let subModuleConfigs = [];
    let subModules = [];
    let stepsUp = 0;
    while (pathParts.length > 0) {
        let currentPath = pathParts.join('/');
        let gitConfig = intParseGitConfig(currentPath);
        function pullSubModules(subMeta) {
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
                    }
                    else {
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
            const rootMeta = {
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
        }
        else {
            let moduleConfig = intParseModuleConfig(currentPath);
            if (moduleConfig) {
                const subMeta = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vZXh0ZW5zaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsaUNBQWlDO0FBQ2pDLDZCQUE4QjtBQUM5QixNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUNoRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDeEMsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUN4RCx3Q0FBd0M7QUFDeEMseUJBQTBCO0FBSTFCLE1BQU0sYUFBYSxHQUFHLGlCQUFpQixDQUFDO0FBS3hDLE1BQU0sSUFBSSxHQUFHO0lBQ1YsTUFBTSxFQUFFLGFBQTRCO0lBQ3BDLE9BQU8sRUFBRSxhQUE2QjtDQUN4QyxDQUFBO0FBRUQsa0JBQXlCLE9BQWdDO0lBRXRELHdEQUF3RDtJQUN4RCxDQUFDO1FBQ0UsTUFBTSxXQUFXLEdBQUcsNkRBQTZELENBQUM7UUFDbEYsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBWTtZQUNsRixlQUFlLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxDQUFDO1FBQ0UsTUFBTSxXQUFXLEdBQUcsb0VBQW9FLENBQUM7UUFDekYsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBWTtZQUNsRixlQUFlLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxDQUFDO1FBQ0UsTUFBTSxXQUFXLEdBQUcsZ0RBQWdELENBQUM7UUFDckUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBWTtZQUNsRixlQUFlLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdkQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxDQUFDO1FBQ0UsTUFBTSxXQUFXLEdBQUcsdURBQXVELENBQUM7UUFDNUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBWTtZQUNsRixlQUFlLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxDQUFDO1FBQ0UsTUFBTSxXQUFXLEdBQUcsK0RBQStELENBQUM7UUFDcEYsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSTtZQUMxRSw0QkFBNEIsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxDQUFDO1FBQ0UsTUFBTSxXQUFXLEdBQUcsc0VBQXNFLENBQUM7UUFDM0YsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSTtZQUMxRSw0QkFBNEIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7QUFDSixDQUFDO0FBdkNELDRCQXVDQztBQUVELHNDQUFzQyxXQUFtQixFQUFFLFlBQXFCO0lBRTdFLElBQUksQ0FBQztRQUNGLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7UUFDcEQsTUFBTSxXQUFXLEdBQTJDLEVBQUUsQ0FBQztRQUMvRCxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDNUYsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLElBQUksWUFBWSxHQUFHLHNCQUFzQixDQUFDO1lBQzFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDNUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUM7UUFDVixDQUFDO1FBRUQsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xCLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU5QyxNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDcEIsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUV2QixHQUFHLENBQUMsQ0FBQyxJQUFJLFFBQVEsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3pDLE1BQU0sWUFBWSxHQUFHLGFBQWEsUUFBUSxvREFBb0QsQ0FBQztnQkFDL0YsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMzQixFQUFFLENBQUMsQ0FBQyxTQUFTLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQzt3QkFDN0IscUJBQXFCO29CQUN4QixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNMLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBQ2xDLENBQUM7Z0JBQ0osQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTCxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUNoQyxDQUFDO2dCQUNELFFBQVEsQ0FBQztZQUNaLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ2pGLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ25CLEtBQUssU0FBUzt3QkFDWCxDQUFDOzRCQUNFLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7NEJBQ3ZCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLHVCQUF1QixDQUFDOzRCQUN4RCxNQUFNLGVBQWUsR0FBRyxZQUFZLEdBQUcsR0FBRyxHQUFHLElBQUksZ0JBQWdCLEtBQUssR0FBRyxHQUFHLENBQUM7NEJBQzdFLFFBQVEsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQ2xDLENBQUM7d0JBQ0QsS0FBSyxDQUFDO29CQUVULEtBQUssT0FBTzt3QkFDVCxDQUFDOzRCQUNFLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUM7NEJBQ3pDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7d0JBQ2hDLENBQUM7d0JBQ0QsS0FBSyxDQUFDO2dCQUNaLENBQUM7WUFDSixDQUFDO1FBQ0osQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixNQUFNLGVBQWUsR0FBRyxpQkFBaUIsU0FBUyxDQUFDLE1BQU0sdUJBQXVCLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN6RyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbkQsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QixNQUFNLGVBQWUsR0FBRyxpQkFBaUIsV0FBVyxDQUFDLE1BQU0seUJBQXlCLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUMvRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbkQsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDO1FBQ1YsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RCxNQUFNLE9BQU8sR0FBRyxHQUFHLGFBQWEscUNBQXFDLFdBQVc7OzttQkFHdEUsaUJBQWlCLEVBQUUsQ0FBQztZQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3JCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDO1FBQ1YsQ0FBQztJQUNKLENBQUM7SUFDRCxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1IsSUFBSSxZQUFZLEdBQUcsR0FBRyxhQUFhLHlDQUF5QyxXQUFXLG9DQUFvQyxDQUFDO1FBQzVILEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxZQUFZLElBQUksWUFBWSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMxQixNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQztJQUNWLENBQUM7QUFFSixDQUFDO0FBR0QseUJBQXlCLFdBQW1CLEVBQUUsT0FBWSxFQUFFLFNBQWtCLEVBQUUsWUFBcUI7SUFDbEcsSUFBSSxDQUFDO1FBQ0YsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztRQUNwRCxJQUFJLFFBQVEsR0FBZSxJQUFJLENBQUM7UUFDaEMsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNiLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDNUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDVixRQUFRLEdBQUc7b0JBQ1IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxDQUFDO29CQUN0QyxHQUFHLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUM7aUJBQ3BDLENBQUM7WUFDTCxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksUUFBUSxDQUFDO1FBQ2IsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzdCLFFBQVEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO1FBQzdCLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDYixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1lBQzlDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDWCxJQUFJLFlBQVksR0FBRyxxQkFBcUIsQ0FBQztnQkFDekMsT0FBTyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxDQUFDO1lBQ1YsQ0FBQztZQUNELFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUN2QyxDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsbURBQW1EO1lBQ25ELE1BQU0sWUFBWSxHQUFHLGFBQWEsUUFBUSxvREFBb0QsQ0FBQztZQUMvRixXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3JGLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDVixNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDbkIsS0FBSyxTQUFTO29CQUNYLENBQUM7d0JBQ0UsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQzt3QkFDdkIsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsdUJBQXVCLENBQUM7d0JBQ3hELE1BQU0sZUFBZSxHQUFHLFlBQVksR0FBRyxHQUFHLEdBQUcsSUFBSSxnQkFBZ0IsS0FBSyxHQUFHLEdBQUcsQ0FBQzt3QkFDN0UsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFDbkMsQ0FBQztvQkFDRCxNQUFNLENBQUM7Z0JBRVYsS0FBSyxPQUFPO29CQUNULENBQUM7d0JBQ0UsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQzt3QkFDekMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQzt3QkFDMUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDaEQsQ0FBQztvQkFDRCxNQUFNLENBQUM7WUFDYixDQUFDO1FBRUosQ0FBQztRQUVELENBQUM7WUFDRSxNQUFNLFlBQVksR0FBRyxHQUFHLGFBQWEscUNBQXFDLFdBQVc7OzttQkFHM0UsaUJBQWlCLEVBQUUsQ0FBQztZQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDO1FBQ1YsQ0FBQztJQUNKLENBQUM7SUFDRCxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1IsSUFBSSxZQUFZLEdBQUcsR0FBRyxhQUFhLHlDQUF5QyxXQUFXLG9DQUFvQyxDQUFDO1FBQzVILEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxZQUFZLElBQUksWUFBWSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMxQixNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQztJQUNWLENBQUM7QUFFSixDQUFDO0FBRUQsMkJBQTJCLFdBQW1CLEVBQUUsaUJBQXlCLEVBQUUsUUFBZ0IsRUFBRSxhQUF3QjtJQUNsSCxJQUFJLENBQUM7UUFDRixpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsaUNBQWlDO1FBQzVGLFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztRQUMxRSxNQUFNLFdBQVcsR0FBRyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqRCxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDaEIsTUFBTSxZQUFZLEdBQUcsR0FBRyxhQUFhOzs7bUJBRzNCLGlCQUFpQjttQkFDakIsUUFBUSxFQUFFLENBQUM7WUFDckIsTUFBTSxDQUFDO2dCQUNKLElBQUksRUFBRSxPQUFrQjtnQkFDeEIsWUFBWTthQUNkLENBQUM7UUFDTCxDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztRQUNsQyxNQUFNLG9CQUFvQixHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFDbEQsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxXQUFXLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDbEQsTUFBTSxVQUFVLEdBQUcsWUFBWSxJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUM7UUFDeEYsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLFdBQVcsVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNyRCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQ2YsSUFBSSxTQUFTLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQztZQUNoQyxJQUFJLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQztZQUN0QyxHQUFHLENBQUMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDeEMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbkMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7b0JBQ3BCLFVBQVUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO29CQUN0QixLQUFLLENBQUM7Z0JBQ1QsQ0FBQztZQUNKLENBQUM7WUFFRCxNQUFNLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsRCxJQUFJLHVCQUF1QixHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztZQUNwSSxJQUFJLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxpQ0FBaUM7WUFDbkgsSUFBSSxHQUFHLEdBQUcsR0FBRyxhQUFhLFNBQVMsTUFBTSxHQUFHLGdCQUFnQixFQUFFLENBQUM7WUFDL0QsRUFBRSxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDdEMsdUJBQXVCLEdBQUcsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlELENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEQsQ0FBQztZQUNELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztZQUNoRSxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixNQUFNLFNBQVMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7Z0JBQ3ZDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsQixHQUFHLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDeEIsTUFBTSxPQUFPLEdBQUcsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDO29CQUNuQyxFQUFFLENBQUMsQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQzt3QkFDdkIsR0FBRyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUE7b0JBQ3hCLENBQUM7Z0JBQ0osQ0FBQztZQUNKLENBQUM7WUFDRCxNQUFNLENBQUM7Z0JBQ0osSUFBSSxFQUFFLFNBQXNCO2dCQUM1QixHQUFHO2dCQUNILGdCQUFnQjtnQkFDaEIsdUJBQXVCO2FBQ3pCLENBQUE7UUFDSixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTCxJQUFJLFlBQVksR0FBRyxHQUFHLGFBQWEsa0RBQWtELFVBQVUsZ0JBQWdCLE1BQU07OzttQkFHM0csaUJBQWlCO21CQUNqQixRQUFRLEVBQUUsQ0FBQztZQUNyQixNQUFNLENBQUM7Z0JBQ0osSUFBSSxFQUFFLE9BQWtCO2dCQUN4QixZQUFZO2FBQ2QsQ0FBQztRQUNMLENBQUM7SUFDSixDQUFDO0lBQ0QsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNSLElBQUksWUFBWSxHQUFHLEdBQUcsYUFBYSx5R0FBeUcsQ0FBQztRQUM3SSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsWUFBWSxJQUFJLFlBQVksQ0FBQyxFQUFFLENBQUM7UUFDbkMsQ0FBQztRQUNELE1BQU0sQ0FBQztZQUNKLElBQUksRUFBRSxPQUFrQjtZQUN4QixZQUFZO1NBQ2QsQ0FBQztJQUNMLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTSxpQkFBaUIsR0FBRyxZQUFZLENBQUM7QUFFdkMsNEJBQTRCLFFBQWdCO0lBQ3pDLDJCQUEyQixHQUFXO1FBQ25DLElBQUksR0FBRyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUM1RCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDZCxDQUFDO0lBQ0osQ0FBQztJQUNELDhCQUE4QixHQUFXO1FBQ3RDLElBQUksR0FBRyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUM3RCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDZCxDQUFDO0lBQ0osQ0FBQztJQUVELFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztJQUMxRSxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLElBQUksZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO0lBQzFCLElBQUksVUFBVSxHQUFrQixFQUFFLENBQUM7SUFDbkMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLE9BQU8sU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMzQixJQUFJLFdBQVcsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLElBQUksU0FBUyxHQUFHLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQy9DLHdCQUF3QixPQUEwQjtZQUMvQyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO1lBQzlCLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQztZQUNmLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDM0MsRUFBRSxDQUFDLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUM5QixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDO29CQUM3QixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzFCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQ3hFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzt3QkFDWCxPQUFPLENBQUMsSUFBSSxDQUFDLGNBQWMsT0FBTyxTQUFTLFdBQVcsd0NBQXdDLENBQUMsQ0FBQztvQkFDbkcsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDTCxNQUFNLFFBQVEsR0FBRzs0QkFDZCxJQUFJLEVBQUUsV0FBVzs0QkFDakIsSUFBSSxFQUFFLE9BQU87NEJBQ2IsR0FBRyxFQUFFLE1BQU07eUJBQ2IsQ0FBQzt3QkFDRixVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO3dCQUMxQixHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN0QixDQUFDO2dCQUNKLENBQUM7WUFDSixDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNkLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBRWIsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ25CLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDbEMsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztnQkFDekIsOERBQThEO2dCQUM5RCxVQUFVO1lBQ2IsQ0FBQztZQUVELE1BQU0sUUFBUSxHQUFjO2dCQUN6QixJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU07Z0JBQ2pCLFFBQVEsRUFBRSxXQUFXO2dCQUNyQixJQUFJLEVBQUUsV0FBVztnQkFDakIsTUFBTSxFQUFFLFNBQVM7Z0JBQ2pCLE9BQU87YUFDVCxDQUFDO1lBQ0YsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3RDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1lBRXJCLFFBQVEsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1lBRWpDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDbkIsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0wsSUFBSSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDckQsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDaEIsTUFBTSxPQUFPLEdBQWdCO29CQUMxQixJQUFJLEVBQUUsSUFBSSxDQUFDLE9BQU87b0JBQ2xCLElBQUksRUFBRSxXQUFXO29CQUNqQixNQUFNLEVBQUUsWUFBWTtvQkFDcEIsT0FBTztpQkFDVCxDQUFDO2dCQUNGLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDckMsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7Z0JBQ3BCLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNsQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU8sRUFBRSxDQUFDO1FBQ1YsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ25CLENBQUM7QUFDSixDQUFDIn0=