import * as vscode from 'vscode';
import * as path from 'node:path';
import { createClassDiagramServices } from '../language/class-diagram-module.js';
import { extractAstNode } from '../cli/cli-util.js';
import { NodeFileSystem } from 'langium/node';
import { Model } from '../language/generated/ast.js';
import { generatePlantUmlString } from '../cli/generator.js';

export class DiagramProvider implements vscode.WebviewPanelSerializer {
    public static readonly viewType = 'class-diagram.preview';
    private static instance: DiagramProvider;
    private panels = new Map<string, vscode.WebviewPanel>();

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

            // Handle disposal
            panel.onDidDispose(
                () => {
                    this.panels.delete(fileName);
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

    public async updateWebviewContent(panel: vscode.WebviewPanel, document: vscode.TextDocument): Promise<void> {
        try {
            const services = createClassDiagramServices(NodeFileSystem).ClassDiagram;
            const model = await extractAstNode<Model>(document.fileName, services);

            // Collect all packages
            const pkgs: any[] = [];
            const collect = (pkg: any) => {
                pkgs.push(pkg);
                pkg.packages?.forEach((subPkg: any) => collect(subPkg));
            };
            model.packages.forEach((pkg: any) => collect(pkg));

            // Generate PlantUML for each package
            const plantUmlStrings = pkgs
                .filter((pkg: any) => pkg.types.length > 0)
                .map((pkg: any) => generatePlantUmlString(pkg));

            panel.webview.html = getWebviewContent(plantUmlStrings);
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

function getWebviewContent(plantUmlStrings: string[]): string {
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
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    padding: 10px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    border-radius: 4px;
                    margin: 10px 0;
                }
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <script>
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
                        
                        container.innerHTML = '';
                        container.appendChild(img);
                    } catch (error) {
                        container.innerHTML = \`<div class="error-message">Error rendering diagram: \${error.message}</div>\`;
                    }
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
