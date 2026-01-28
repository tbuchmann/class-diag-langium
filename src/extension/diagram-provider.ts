import * as vscode from 'vscode';
import * as path from 'node:path';
import { createClassDiagramServices } from '../language/class-diagram-module.js';
import { extractAstNode } from '../cli/cli-util.js';
import { NodeFileSystem } from 'langium/node';
import { Model, Package } from '../language/generated/ast.js';
import { generatePlantUmlString } from '../cli/generator.js';

interface PackageInfo {
    name: string;
    fullName: string;
    plantUmlString: string;
    pkg: Package;
}

export class DiagramProvider implements vscode.WebviewPanelSerializer {
    public static readonly viewType = 'class-diagram.preview';
    private static instance: DiagramProvider;
    private panels = new Map<string, vscode.WebviewPanel>();
    private packageCache = new Map<string, PackageInfo[]>();

    public static getInstance(): DiagramProvider {
        if (!DiagramProvider.instance) {
            DiagramProvider.instance = new DiagramProvider();
        }
        return DiagramProvider.instance;
    }

    public async deserializeWebviewPanel(
        webviewPanel: vscode.WebviewPanel,
        state: unknown
    ): Promise<void> {
        // Called when a webview is restored from a saved state
        webviewPanel.webview.options = getWebviewOptions();
        this.panels.set(webviewPanel.title, webviewPanel);
        
        const document = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(webviewPanel.title)
        );
        await this.updateWebviewContent(webviewPanel, document);

        webviewPanel.onDidDispose(
            () => {
                this.panels.delete(webviewPanel.title);
                this.packageCache.delete(webviewPanel.title);
            },
            null
        );
    }

    public async openPreview(editor: vscode.TextEditor, viewColumn: vscode.ViewColumn = vscode.ViewColumn.Beside): Promise<void> {
        const document = editor.document;
        const fileName = document.fileName;

        // Check if a panel for this file already exists
        let panel = this.panels.get(fileName);

        if (!panel) {
            // Create a new webview panel
            panel = vscode.window.createWebviewPanel(
                DiagramProvider.viewType,
                `Preview: ${path.basename(fileName)}`,
                viewColumn,
                getWebviewOptions()
            );

            panel.title = fileName;
            this.panels.set(fileName, panel);

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    if (message.command === 'packageSelected') {
                        await this.handlePackageSelection(fileName, message.selectedPackage);
                    } else if (message.command === 'findInEditor') {
                        this.handleFindInEditor(fileName, message.elementName);
                    }
                }
            );

            // Handle disposal
            panel.onDidDispose(
                () => {
                    this.panels.delete(fileName);
                    this.packageCache.delete(fileName);
                },
                null
            );
        } else {
            // Bring existing panel to front
            panel.reveal(viewColumn);
        }

        // Update the webview with the current content
        await this.updateWebviewContent(panel, document);
    }

    private async handlePackageSelection(fileName: string, selectedPackage: string): Promise<void> {
        const packages = this.packageCache.get(fileName);
        if (!packages) return;

        const panel = this.panels.get(fileName);
        if (!panel) return;

        if (selectedPackage === '') {
            // Show all packages
            const plantUmlStrings = packages.map(p => p.plantUmlString);
            panel.webview.html = getWebviewContent(plantUmlStrings, packages);
        } else {
            // Show single package
            const selected = packages.find(p => p.fullName === selectedPackage);
            if (selected) {
                panel.webview.html = getWebviewContent([selected.plantUmlString], packages, selectedPackage);
            }
        }
    }

    private handleFindInEditor(fileName: string, elementName: string): void {
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.fileName === fileName
        );
        
        if (!editor) {
            vscode.window.showErrorMessage('Source editor not found');
            return;
        }

        // Search for the element name in the document
        const text = editor.document.getText();
        const matches = [...text.matchAll(new RegExp(`\\b${elementName}\\b`, 'g'))];
        
        if (matches.length === 0) {
            vscode.window.showWarningMessage(`"${elementName}" not found in editor`);
            return;
        }

        // Jump to first match
        const match = matches[0];
        const offset = match.index || 0;
        const position = editor.document.positionAt(offset);
        const endPosition = editor.document.positionAt(offset + elementName.length);

        editor.selection = new vscode.Selection(position, endPosition);
        editor.revealRange(
            new vscode.Range(position, endPosition),
            vscode.TextEditorRevealType.InCenter
        );
    }

    public async updateWebviewContent(panel: vscode.WebviewPanel, document: vscode.TextDocument): Promise<void> {
        try {
            const services = createClassDiagramServices(NodeFileSystem).ClassDiagram;
            const model = await extractAstNode<Model>(document.fileName, services);

            // Collect all packages with their full names and PlantUML strings
            const packageInfos: PackageInfo[] = [];
            
            const collect = (pkg: any, parentPath: string = ''): void => {
                const fullName = parentPath ? `${parentPath}.${pkg.name}` : pkg.name;
                if (pkg.types.length > 0) {
                    packageInfos.push({
                        name: pkg.name,
                        fullName: fullName,
                        plantUmlString: generatePlantUmlString(pkg),
                        pkg: pkg
                    });
                }
                pkg.packages?.forEach((subPkg: any) => collect(subPkg, fullName));
            };
            
            model.packages.forEach((pkg: any) => collect(pkg));

            // Cache the packages
            this.packageCache.set(document.fileName, packageInfos);

            // Get PlantUML strings for all packages
            const plantUmlStrings = packageInfos.map(p => p.plantUmlString);

            panel.webview.html = getWebviewContent(plantUmlStrings, packageInfos);
        } catch (error) {
            panel.webview.html = getErrorContent((error as Error).message);
        }
    }

    public updateActivePanel(editor: vscode.TextEditor): void {
        const panel = this.panels.get(editor.document.fileName);
        if (panel) {
            this.updateWebviewContent(panel, editor.document);
        }
    }

    public closePanel(fileName: string): void {
        const panel = this.panels.get(fileName);
        if (panel) {
            panel.dispose();
        }
    }

    public hasPanel(fileName: string): boolean {
        return this.panels.has(fileName);
    }
}

function getWebviewOptions(): vscode.WebviewPanelOptions & vscode.WebviewOptions {
    return {
        enableScripts: true,
        enableCommandUris: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(__dirname, '..', '..'))
        ]
    };
}

function getWebviewContent(plantUmlStrings: string[], packageInfos?: PackageInfo[], selectedPackage?: string): string {
    // Build package selector if multiple packages exist
    const packageSelector = packageInfos && packageInfos.length > 1 ? `
        <div class="package-selector">
            <label for="package-select">Show Package:</label>
            <select id="package-select" onchange="handlePackageChange()">
                <option value="all">All Packages</option>
                ${packageInfos.map(p => `<option value="${p.fullName}" ${selectedPackage === p.fullName ? 'selected' : ''}>${p.fullName}</option>`).join('\n')}
            </select>
        </div>
    ` : '';

    const plantUmlDiagrams = plantUmlStrings
        .map((puml, idx) => `
        <div id="diagram-${idx}" class="diagram-container"></div>
        <script>encodePlantUML('diagram-${idx}', \`${escapeBackticks(puml)}\`);</script>`)
        .join('\n');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Class Diagram Preview</title>
            <script src="https://cdn.jsdelivr.net/npm/plantuml-encoder@1.4.0/dist/plantuml-encoder.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 16px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                }
                .package-selector {
                    margin-bottom: 20px;
                    padding: 10px;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .package-selector label {
                    font-weight: 500;
                    white-space: nowrap;
                }
                .package-selector select {
                    flex: 1;
                    padding: 6px 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 3px;
                    font-family: var(--vscode-font-family);
                    cursor: pointer;
                }
                .package-selector select:hover {
                    border-color: var(--vscode-focusBorder);
                }
                .package-selector select:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
                }
                .diagram-container {
                    margin: 20px 0;
                    display: flex;
                    justify-content: center;
                }
                .diagram-container img {
                    max-width: 100%;
                    height: auto;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 10px;
                    background-color: var(--vscode-panel-background);
                    cursor: pointer;
                    transition: filter 0.2s;
                }
                .diagram-container img:hover {
                    filter: brightness(1.1);
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    padding: 10px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    border-radius: 4px;
                    margin: 10px 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            ${packageSelector}
            <script>
                // Get the VS Code API if available (when running in webview)
                const vscode = (function() {
                    try {
                        return acquireVsCodeApi();
                    } catch (e) {
                        return null;
                    }
                })();

                function handlePackageChange() {
                    const select = document.getElementById('package-select');
                    if (select && vscode) {
                        vscode.postMessage({
                            command: 'packageSelected',
                            selectedPackage: select.value === 'all' ? '' : select.value
                        });
                    }
                }

                function encodePlantUML(elementId, plantUmlCode) {
                    const container = document.getElementById(elementId);
                    if (!container) return;

                    try {
                        // Use the plantuml-encoder library
                        const encoded = plantumlEncoder.encode(plantUmlCode);
                        const imageUrl = \`https://www.plantuml.com/plantuml/png/\${encoded}\`;
                        
                        const img = document.createElement('img');
                        img.src = imageUrl;
                        img.alt = 'PlantUML Diagram';
                        
                        // Add click handler to find class names in editor
                        img.addEventListener('click', (e) => {
                            // Try to extract class name from URL - PlantUML doesn't expose element info
                            // So we'll use a simpler approach: right-click context menu or similar
                            // For now, we'll show a tooltip
                            console.log('Diagram clicked at:', e.clientX, e.clientY);
                        });
                        
                        container.innerHTML = '';
                        container.appendChild(img);
                    } catch (error) {
                        container.innerHTML = \`<div class="error-message">Error rendering diagram: \${error.message}</div>\`;
                    }
                }

                // Extract class/interface names from PlantUML code and create searchable index
                function createClassIndex() {
                    const classes = new Map();
                    
                    // Extract class names from all encodePlantUML function calls
                    const pageSource = document.documentElement.innerHTML;
                    const classRegex = /class\\s+([A-Za-z_][A-Za-z0-9_]*)|interface\\s+([A-Za-z_][A-Za-z0-9_]*)|enum\\s+([A-Za-z_][A-Za-z0-9_]*)/g;
                    
                    let match;
                    while ((match = classRegex.exec(pageSource)) !== null) {
                        const className = match[1] || match[2] || match[3];
                        if (className && !classes.has(className)) {
                            classes.set(className, true);
                        }
                    }
                    
                    return classes;
                }

                const classIndex = createClassIndex();

                // Make diagrams interactive - allow finding in editor via console command
                if (vscode) {
                    window.findInEditor = function(className) {
                        if (classIndex.has(className)) {
                            vscode.postMessage({
                                command: 'findInEditor',
                                elementName: className
                            });
                        } else {
                            console.warn('Class not found in diagram:', className);
                        }
                    };
                }
            </script>
            ${plantUmlDiagrams}
        </body>
        </html>
    `;
}

function getErrorContent(errorMessage: string): string {
    const escapedMessage = errorMessage.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    margin: 0;
                    padding: 16px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    padding: 10px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    border-radius: 4px;
                    margin: 10px 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
            </style>
        </head>
        <body>
            <div class="error-message">Error: ${escapedMessage}</div>
        </body>
        </html>
    `;
}

function escapeBackticks(str: string): string {
    return str.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}
