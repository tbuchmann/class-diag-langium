import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import { createClassDiagramServices } from "../../src/language/class-diagram-module.js";
import { Model, isModel } from "../../src/language/generated/ast.js";

let services: ReturnType<typeof createClassDiagramServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createClassDiagramServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.ClassDiagram);
    parse = (input: string) => doParse(input, { validation: true });

    // activate the following if your linking test requires elements from a built-in library, for example
    // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating', () => {
  
    test('check no errors', async () => {
        document = await parse(`
            package de {
                primitive Integer
                primitive String
                class Test {
                    public a : Integer
                    private b : String
                    c : String
                    protected doSmth(test : String) : Integer {}
                }
                interface ITest {}
                enum ETest {A, B, C}
                datatype DTest {}
            }
        `);        

        expect(
            // here we first check for validity of the parsed document object by means of the reusable function
            //  'checkDocumentValid()' to sort out (critical) typos first,
            // and then evaluate the diagnostics by converting them into human readable strings;
            // note that 'toHaveLength()' works for arrays and strings alike ;-)
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
    });

    test('check capital letter validation', async () => {
        document = await parse(`
            package de {
                class test {}
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            // 'expect.stringContaining()' makes our test robust against future additions of further validation rules
            expect.stringContaining(s`
                [2:22..2:26]: Type name should start with a capital.
            `)
        );
    });

    test('check lower case property name', async () => {
        document = await parse(`
            package de {
                primitive Integer
                class Test {                    
                    public A : Integer
                }
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [4:27..4:28]: Property name should start with lowercase.
            `)
        );
    });

    test('check lower case operation name', async () => {
        document = await parse(`
            package de {
                primitive Integer
                class Test {
                    public DoSmth(test : Integer) : Integer {}
                }
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [4:27..4:33]: Operation name should start with lowercase.
            `)
        );
    });

    test('check duplicate type name', async () => {
        document = await parse(`
            package de {
                class Test {}
                class Test {}
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [2:22..2:26]: Duplicate type name 'Test'.
                [3:22..3:26]: Duplicate type name 'Test'.
            `)
        );
    });

    test('check duplicate property name', async () => {
        document = await parse(`
            package de {
                primitive Integer
                class Test {
                    public a : Integer
                    public a : Integer
                }
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [4:27..4:28]: Duplicate property name 'a'.
                [5:27..5:28]: Duplicate property name 'a'.
            `)
        );
    });

    test('check duplicate operation name', async () => {
        document = await parse(`
            package de {
                primitive Integer
                class Test {
                    public a() : Integer {}
                    public a() : Integer {}
                }
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [4:27..4:28]: Duplicate operation name 'a'.
                [5:27..5:28]: Duplicate operation name 'a'.
            `)
        );
    });

    test('check duplicate package name', async () => {
        document = await parse(`
            package de {
                class Test {}
            }
            package de {
                class Test {}
            }
        `);

        console.log(document?.diagnostics?.map(diagnosticToString)?.join('\n'));

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [1:20..1:22]: Duplicate package name 'de'.
                [4:20..4:22]: Duplicate package name 'de'.
            `)
        );
        
    });

    test('check duplicate enum constant name', async () => {
        document = await parse(`
            package de {
                enum Test {A, A}
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [2:27..2:28]: Duplicate enumeration literal name 'A'.
            `)
        );

    });

    test('check class inheritance cycle', async () => {
        document = await parse(`
            package de {
                class A extends B {}
                class B extends A {}
            }
        `);
            //console.log(document?.diagnostics?.map(diagnosticToString)?.join('\n'));
        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [2:32..2:33]: Cycle in class inheritance
            `)
        );
    });

    test('check interface inheritance cycle', async () => {
        document = await parse(`
            package de {
                interface A extends B {}
                interface B extends A {}
            }
        `);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [2:36..2:37]: Cycle in interface inheritance
            `)
        );
    });

    test('check enum literal consists of capitals', async () => {
        document = await parse(`
            package de {
                enum Test {aBC}
            }
        `);

        console.log(document?.diagnostics?.map(diagnosticToString)?.join('\n'));

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining(s`
                [2:27..2:30]: Enumeration literal should consist of capitals.
            `)
        );
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isModel(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Model}'.`
        || undefined;
}

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
