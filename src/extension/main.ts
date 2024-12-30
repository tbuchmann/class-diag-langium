import type { LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { generateClassDiagram } from '../cli/generator.js';
import { createClassDiagramServices } from '../language/class-diagram-module.js';
import { extractAstNode } from '../cli/cli-util.js';
import { NodeFileSystem } from 'langium/node';
import { Model } from '../language/generated/ast.js';
import chalk from 'chalk';

let client: LanguageClient;

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    let disposable = vscode.workspace.onDidSaveTextDocument((document) => {        
        if (document.fileName.endsWith('.cdiag')) {
            const filePath = document.fileName;
            const directoryPath = path.dirname(filePath);
            generateAction(document.fileName, directoryPath+'/generated');
        }
    });

    context.subscriptions.push(disposable);
    client = startLanguageClient(context);
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

export const generateAction = async (fileName: string, destination: string): Promise<void> => {
    const services = createClassDiagramServices(NodeFileSystem).ClassDiagram;    
    const model = await extractAstNode<Model>(fileName, services);
    model.packages.forEach(pkg => {
        const generatedFilePath = generateClassDiagram(pkg, fileName, destination);
        console.log(chalk.green(`Code generated successfully: ${generatedFilePath}`));
    });    
};

function startLanguageClient(context: vscode.ExtensionContext): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'class-diagram' }]
    };

    // Create the language client and start the client.
    const client = new LanguageClient(
        'class-diagram',
        'Class Diagram',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();
    return client;
}
