// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as minimatch from 'minimatch';
import { json } from 'stream/consumers';

interface SyncConfig {
    targetFolders: Array<{
        path: string;
        include: string[];
        exclude: string[];
    }>;
    syncOnSave: boolean;
    createTargetFolder: boolean;
}

let config: SyncConfig;
let bSyning: boolean = true;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('syncOnSave.initConfigSyncFile', async () => {
            const configPath = vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'sync.json') : '';
            if (!fs.existsSync(configPath)) {
                const defaultConfig: SyncConfig = {
                    targetFolders: [{
                        path: './',
                        include: ['**/*.h', '**/*.hpp', '**/*.cc', '**/*.cxx', '**/*.cpp', '**/*.ui', '**/*.cmake', '**/*.ts', '**/*.js'],
                        exclude: ['node_modules/**', '.git/**', 'github/**', 'gitlab/**']
                    }],
                    syncOnSave: true,
                    createTargetFolder: true
                };
                fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            }

            // const doc = await vscode.workspace.openTextDocument(configPath);
            // await vscode.window.showTextDocument(doc);
            const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'config.html');
            const htmlDoc = await vscode.workspace.openTextDocument(htmlPath);
            let configData: SyncConfig = {
                targetFolders: [],
                syncOnSave: false,
                createTargetFolder: false
            };
            if (fs.existsSync(configPath)) {
                try {
                    configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch (error) {
                    console.log('读取sync.json配置文件失败:', error);
                }
            }
            const panel = vscode.window.createWebviewPanel('configSync', '配置同步', vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    enableForms: true,
                    enableCommandUris: true, // 启用命令 URI
                    retainContextWhenHidden: true, // 保留上下文
                }
            );
            panel.webview.onDidReceiveMessage((message) => {
                switch (message.command) {
                    case 'showAlert':
                        vscode.window.showInformationMessage(message.message);
                        break;
                    case 'updateConfig':
                        try {
                            // 处理配置文件更新
                            const configPath = vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'sync.json') : '';
                            const formattedJson = message.data; //JSON.stringify(message.data, null, 2);
                            fs.writeFileSync(configPath, formattedJson, 'utf-8');

                            // 发送成功消息回 Webview
                            panel.webview.postMessage({
                                command: 'updateConfigResult',
                                success: true
                            });
                        } catch (error) {
                            // 发送失败消息回 Webview
                            panel.webview.postMessage({
                                command: 'updateConfigResult',
                                success: false,
                                error: `${error}`
                            });
                        }
                        break;
                }
            });
            const translations: { [key: string]: { title: string; targetPath: string; includePatterns: string; excludePatterns: string; remove: string; add: string; sync: string; create: string; submit: string; alert: string; } } = {
                en: {
                    title: "Synchronization Configuration",
                    targetPath: "Target Folder Path",
                    includePatterns: "Include Patterns (one per line)",
                    excludePatterns: "Exclude Patterns (one per line)",
                    remove: "Remove",
                    add: "Add Configuration",
                    sync: "Sync on Save:",
                    create: "Create Target Folder:",
                    submit: "Save",
                    alert: "At least one configuration must be retained!"
                },
                zh: {
                    title: "同步功能配置",
                    targetPath: "目标文件夹路径",
                    includePatterns: "包含规则（每行一个规则）",
                    excludePatterns: "排除规则（每行一个规则）",
                    remove: "移除",
                    add: "添加配置",
                    sync: "保存时同步:",
                    create: "创建目标文件夹:",
                    submit: "保存",
                    alert: "至少需要保留一个配置！"
                }
            };
            let currentLang = 'en';
            let htmlContent = await htmlDoc.getText();
            let syncJsonContent = '';
            configData.targetFolders.forEach((targetFolder, index) => {
                syncJsonContent += `<div class='form-grid'>`;
                syncJsonContent += `
                <input type="text" name="targetPath" placeholder="${translations[currentLang].targetPath}" value="${targetFolder.path}" required>
                <textarea name="includePatterns" placeholder="${translations[currentLang].includePatterns}">${targetFolder.include.join('\n')}</textarea>
                <textarea name="excludePatterns" placeholder="${translations[currentLang].excludePatterns}">${targetFolder.exclude.join('\n')}</textarea>
                <button type="button" class="remove-button" id="remove-button" onclick="removeFolderConfig(this)">${translations[currentLang].remove}</button>
                `;
                syncJsonContent += `</div>`;
            });
            htmlContent = htmlContent.replace('<!-- SYNC_JSON_CONTENT -->', syncJsonContent);
            panel.webview.html = htmlContent;
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('syncOnSave.stopSyncFile', async () => {
            bSyning = false;
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('syncOnSave.startSyncFile', async () => {
            bSyning = true;
        })
    );
    try {
        const watcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
            const filePath = document.uri.fsPath;
            const configPath = vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'sync.json') : '';

            if (!bSyning) {
                return;
            }
            if (!config) {
                if (!fs.existsSync(configPath)) {
                    // console.log('未找到sync.json配置文件，不激活watcher');
                    return;
                }
                try {
                    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch (error) {
                    console.log('未找到sync.json配置文件，不激活watcher');
                    vscode.window.showErrorMessage(`配置文件格式读取失败: ${error}`);
                    return;
                }
            } else if (filePath === configPath) {
                try {
                    const newConfig: SyncConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    config = newConfig;
                    vscode.window.setStatusBarMessage('同步配置已更新');
                } catch (error) {
                    vscode.window.showErrorMessage(`同步配置更新失败: ${error}`);
                }
                return;
            }

            if (!config.syncOnSave) {
                return;
            }

            for (const target of config.targetFolders) {
                if (target.path === '' || path.resolve(vscode.workspace.rootPath || '', target.path) === vscode.workspace.rootPath) {
                    continue;
                }
                const targetPath = path.resolve(vscode.workspace.rootPath || '', target.path);
                if (config.createTargetFolder && !fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, { recursive: true });
                }
                const relativePath = vscode.workspace.rootPath ? path.relative(vscode.workspace.rootPath, filePath) : '';
                const destPath = path.join(targetPath, relativePath);
                // 检查文件是否符合include/exclude规则
                // 提前编译正则表达式
                const includePatterns = target.include.map(pattern => minimatch.makeRe(pattern));
                const excludePatterns = target.exclude.map(pattern => minimatch.makeRe(pattern));
                const includeSync = includePatterns.some(regex => regex && regex.test(relativePath));
                const excludeSync = excludePatterns.every(regex => !regex || !regex.test(relativePath));
                const shouldSync = includeSync && excludeSync;
                if (shouldSync) {
                    // 创建目标目录结构
                    try {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        // 执行文件复制
                        fs.copyFileSync(filePath, destPath);
                        // 添加消息提示逻辑
                        vscode.window.setStatusBarMessage(`文件 ${filePath} 已同步到 ${destPath}`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`文件 ${filePath} 同步到 ${destPath} 失败: ${error}`);
                    }
                }
            }
        });
        context.subscriptions.push(watcher);
    } catch (error) {
        console.log('同步配置加载时出现错误:', error);
        vscode.window.showErrorMessage(`同步配置加载失败: ${error}`);
    }
}

// This method is called when your extension is deactivated
export function deactivate() { }

// 修改activationEvents，使其在打开文件夹时自动激活
// activationEvents: [
//     "onFolderOpen"
// ];

