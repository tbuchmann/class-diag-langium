import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import { createClassDiagramServices } from "../../src/language/class-diagram-module.js";
import { Association, Class, Interface, Model, isModel } from "../../src/language/generated/ast.js";
import type { Diagnostic } from "vscode-languageserver-types";

let services: ReturnType<typeof createClassDiagramServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createClassDiagramServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.ClassDiagram);

    // activate the following if your linking test requires elements from a built-in library, for example
    // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Java generation tests', () => {
    test('Empty model', async () => {
        document = await parse('');
        expect(document).toBeDefined();
        // if (isModel(document)) {
        //     expect(s(document)).toBe('');
        // }
    });

    test('Simple model', async () => {
        document = await parse(`
            package test {
                class A {}
                class B {}
            }
        `);
        // expect(document).toBeDefined();
        // if (isModel(document)) {
        //     expect(s(document)).toBe(`
    });
});