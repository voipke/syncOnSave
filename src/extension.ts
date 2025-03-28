// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as minimatch from 'minimatch';

interface SyncConfig {
    lang: string,
    targetFolders: Array<{
        path: string;
        include: string[];
        exclude: string[];
        syncSwitcher: boolean;
        createDir: boolean;
        copyFromWorkspace: boolean;
        fileEncoderSelector: string;
    }>;
}

let globalConfig: SyncConfig;
const defaultConfig: SyncConfig = {
    lang: 'en',
    targetFolders: [{
        path: './',
        include: ['**/*.h', '**/*.hpp', '**/*.cc', '**/*.cxx', '**/*.cpp', '**/*.ui', '**/*.cmake', '**/CMakeLists.txt', '**/*.ts', '**/*.js', '**/*.py'],
        exclude: ['node_modules/**', '.git/**', 'github/**', 'gitlab/**'],
        syncSwitcher: true,
        createDir: true,
        copyFromWorkspace: true,
        fileEncoderSelector: 'nochange'
    }],
};

let bSyning: boolean = true;

/**
 * 复制文件并修改行尾格式
 * @param {string} filePath 源文件路径
 * @param {string} destPath 目标文件路径
 * @param {'lf' | 'crlf'} lineEnding 目标行尾格式（lf 或 crlf）
 */
function copyFileWithLineEnding(filePath: string, destPath: string, lineEnding: string) {
    // 读取源文件内容
    const content = fs.readFileSync(filePath, 'utf8');

    // 统一行尾格式
    let normalizedContent;
    if (lineEnding === 'lf') {
        normalizedContent = content.replace(/\r\n/g, '\n'); // 将 CRLF 替换为 LF
    } else if (lineEnding === 'crlf') {
        normalizedContent = content.replace(/\n/g, '\r\n'); // 将 LF 替换为 CRLF
    } else {
        throw new Error('Invalid line ending. Use "lf" or "crlf".');
    }

    // 写入目标文件
    fs.writeFileSync(destPath, normalizedContent, 'utf8');
}

function findSyncConfig(currentPath: string) {
    let dir = path.dirname(currentPath);
    const workspaceRoot = vscode.workspace.rootPath || '';
    
    while (dir !== workspaceRoot && dir !== path.parse(dir).root) {
        const configPath = path.join(dir, 'sync.json');
        if (fs.existsSync(configPath)) {
            return configPath;
        }
        dir = path.dirname(dir);
    }
    return path.join(workspaceRoot, 'sync.json');
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('syncOnSave.initConfigSyncFile', async () => {
            const configPath = vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'sync.json') : '';
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            }

            const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'config.html');
            const htmlDoc = await vscode.workspace.openTextDocument(htmlPath);
            let configData: SyncConfig = defaultConfig;
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
                            globalConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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

            let htmlContent = await htmlDoc.getText();
            htmlContent = htmlContent.replace('<!-- INIT_SCRIPTS_CONTENT -->', JSON.stringify(configData));
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
            // const rootConfigPath = vscode.workspace.rootPath ? path.join(vscode.workspace.rootPath, 'sync.json') : '';
            const configPath = findSyncConfig(filePath);
            const configRootDir = path.dirname(configPath);
            // 判断文件是否在当前工作目录下
            if (!vscode.workspace.rootPath || !filePath.startsWith(vscode.workspace.rootPath)) {
                return;
            }

            if (!bSyning) {
                return;
            }

            // 如果不存在配置文件
            if (!fs.existsSync(configPath)) {
                return;
            }

            // 如果编辑的是sync.json文件本身
            if (filePath === configPath) {
                try {
                    const newConfig: SyncConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    globalConfig = newConfig;
                    vscode.window.setStatusBarMessage('同步配置已更新');
                } catch (error) {
                    vscode.window.showErrorMessage(`同步配置更新失败: ${error}`);
                }
                return;
            }

            // if (!globalConfig && fs.existsSync(configPath)) 
            {
                try {
                    globalConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch (error) {
                    console.log('当前目录的sync.json文件配置加载失败!');
                    vscode.window.showErrorMessage(`当前目录的sync.json文件配置加载失败: ${error}`);
                    return;
                }
            }

            for (const target of globalConfig.targetFolders) {
                if (!target.syncSwitcher) {
                    continue;
                }

                let srcRootPath = '';
                if (target.copyFromWorkspace) {
                    srcRootPath = vscode.workspace.rootPath;
                } else {
                    srcRootPath = configRootDir;
                }
                if (target.path === '' || path.resolve(srcRootPath || '', target.path) === srcRootPath) {
                    continue;
                }
                // 创建目标目录结构

                const targetPath = path.resolve(srcRootPath || '', target.path);
                const relativePath = srcRootPath ? path.relative(srcRootPath, filePath) : '';
                const destPath = path.join(targetPath, relativePath);
                try {
                    const destDir = path.dirname(destPath);
                    if (target.createDir && !fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`创建目标文件夹 ${path.dirname(destPath)} 失败: ${error}`);
                }

                // 检查文件是否符合include/exclude规则
                // 提前编译正则表达式
                const includePatterns = target.include.map(pattern => minimatch.makeRe(pattern));
                const excludePatterns = target.exclude.map(pattern => minimatch.makeRe(pattern));
                const includeSync = includePatterns.some(regex => regex && regex.test(relativePath.replace(/\\/g, '/')));
                const excludeSync = excludePatterns.every(regex => !regex || !regex.test(relativePath.replace(/\\/g, '/')));
                const shouldSync = includeSync && excludeSync;
                if (shouldSync) {
                    try {
                        // 执行文件复制
                        if (target.fileEncoderSelector === 'lf') {
                            copyFileWithLineEnding(filePath, destPath, 'lf');
                        } else if (target.fileEncoderSelector === 'crlf') {
                            copyFileWithLineEnding(filePath, destPath, 'crlf');
                        } else {
                            fs.copyFileSync(filePath, destPath);
                        }
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

