import type { Model } from '../language/generated/ast.js';
import chalk from 'chalk';
import { Command } from 'commander';
import { ClassDiagramLanguageMetaData } from '../language/generated/module.js';
import { createClassDiagramServices } from '../language/class-diagram-module.js';
import { extractAstNode } from './cli-util.js';
import { generateCode } from './generator.js';
import { generateSpringCode } from './generatorSpring.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createClassDiagramServices(NodeFileSystem).ClassDiagram;    
    const model = await extractAstNode<Model>(fileName, services);
    const generatedFilePath = generateCode(model, fileName, opts.destination);
    console.log(chalk.green(`Code generated successfully: ${generatedFilePath}`));
};

function resolveSpringDestination(projectRoot: string, basePackage: string): string {
    return path.join(projectRoot, 'src', 'main', 'java', ...basePackage.split('.'));
}

export const generateSpringAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createClassDiagramServices(NodeFileSystem).ClassDiagram;
    const model = await extractAstNode<Model>(fileName, services);
    const basePkg = opts.package ?? '';
    const destination = resolveSpringDestination(opts.projectRoot ?? '.', basePkg);
    generateSpringCode(model, fileName, destination, basePkg || undefined);
    console.log(chalk.green(`Spring code generated successfully in: ${destination}`));
};

export type GenerateOptions = {
    destination?: string;
    projectRoot?: string;
    package?: string;
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = ClassDiagramLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates JavaScript code that prints "Hello, {name}!" for each greeting in a source file')
        .action(generateAction);

    program
        .command('generate-spring')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .requiredOption('-r, --project-root <dir>', 'root directory of the Spring Boot project')
        .requiredOption('-p, --package <pkg>', 'base Java package (e.g., com.zufar.icedlatte)')
        .description('generates Spring Boot / JPA code into <projectRoot>/src/main/java/<package>')
        .action(generateSpringAction);

    program.parse(process.argv);
}
