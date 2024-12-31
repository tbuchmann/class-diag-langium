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

describe('Parsing tests', () => {

    test('parse simple model', async () => {
        document = await parse(`
            package de {
            }
            package test {
            }
        `);

        // check for absensce of parser errors the classic way:
        //  deacivated, find a much more human readable way below!
        expect(document.parseResult.parserErrors).toHaveLength(0);

        
        expect(
            // here we use a (tagged) template expression to create a human readable representation
            //  of the AST part we are interested in and that is to be compared to our expectation;
            // prior to the tagged template expression we check for validity of the parsed document object
            //  by means of the reusable function 'checkDocumentValid()' to sort out (critical) typos first;
            checkDocumentValid(document) || s`
                Top-Level Packages:
                  ${document.parseResult.value?.packages?.map(p => p.name)?.join('\n')}                
            `
        ).toBe(s`
            Top-Level Packages:
              de
              test
        `);        
    });

    test('parse model with nested packages', async () => {
        document = await parse(`
            package de {
                package university {
                    package hof {
                        class Test {}
                        interface ITest {}
                        enum TestEnum { A, B }
                        dt TestDT {}
                        pt TestPT
                    }
                }
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Package:
              ${document.parseResult.value?.packages?.map(p => {
                  let packageNames: string[] = [];
                  let currentPackage = p;
                  while (currentPackage) {
                  packageNames.unshift(currentPackage.name);
                  currentPackage = currentPackage.packages?.[0];
                  }
                  packageNames.reverse();
                  return packageNames.join('.');
              })?.join('\n')}
            Content:
              ${document.parseResult.value?.packages?.[0].packages?.[0].packages?.[0].types?.map(c => c.name)?.join('\n')}          
            `
        ).toBe(s`
            Package:
              de.university.hof
            Content:
              Test
              ITest
              TestEnum
              TestDT
              TestPT
        `);
    });

    test('parse class with properties and operations', async () => {
        document = await parse(`
            package de {
                pt Integer
                pt String
                class Test {
                    public a : Integer
                    private b : String
                    c : String
                    protected doSmth(test : String) : Integer
                }
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Class:
              ${document.parseResult.value?.packages?.[0].types?.[2].name}
            Properties:
              ${(document.parseResult.value?.packages?.[0].types?.[2] as Class).properties?.map(p => p.name)?.join('\n')}
            Operations:
              ${(document.parseResult.value?.packages?.[0].types?.[2] as Class).operations?.map(o => o.name)?.join('\n')}
            `
        ).toBe(s`
            Class:
              Test
            Properties:
              a
              b
              c
            Operations:
              doSmth
        `);
    });

    test('parse class with inheritance', async () => {
        document = await parse(`
            package de {
                class A {}
                class B extends A {}
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Classes:
              ${(document.parseResult.value?.packages?.[0].types as Class[]).map(c => c.name)?.join('\n')}
            Super-Classes of B:
              ${(document.parseResult.value?.packages?.[0].types?.[1] as Class).superClasses?.map(c => c.ref?.name)?.join('\n')}
            `
        ).toBe(s`
            Classes:
              A
              B
            Super-Classes of B:
              A
        `);
    });

    test('parse class with associations', async () => {
        document = await parse(`
            package de {
                class A {}
                class B {}
                assoc contains {
                    a : A [0..1] 
                    b : B [0..-1] composite +
                }
            }
        `);         

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Classes:
              ${(document.parseResult.value?.packages?.[0].types as Class[]).map(c => c.name)?.join('\n')}
            Associations:
              ${(document.parseResult.value?.packages?.[0].types?.[2] as Association).properties?.map(a => a.name + ":" + a.type.ref?.name)?.join('\n')}
            `
        ).toBe(s`
            Classes:
              A
              B
              contains
            Associations:
              a:A
              b:B
        `);
    });

    test('parse interface with multiple inheritance', async () => {
        document = await parse(`
            package de {
                interface A {}
                interface B {}
                interface C extends A, B {}
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Interfaces:
              ${(document.parseResult.value?.packages?.[0].types as Interface[]).map(c => c.name)?.join('\n')}
            Super-Interfaces:
              ${(document.parseResult.value?.packages?.[0].types?.[2] as Interface).superInterfaces?.map(i => i.ref?.name)?.join('\n')}
            `
        ).toBe(s`
            Interfaces:
              A
              B
              C
            Super-Interfaces:
              A
              B
        `);
    });

    test('class with inheritance and interface implementation', async () => {
        document = await parse(`
            package de {
                interface I {}
                class A {}
                class B extends A implements I {}
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Types:
              ${(document.parseResult.value?.packages?.[0].types).map(c => c.name)?.join('\n')}
            Super-Types of B:
              ${(document.parseResult.value?.packages?.[0].types[2] as Class).superClasses?.map(c => c.ref?.name)?.join('\n')}
              ${(document.parseResult.value?.packages?.[0].types[2] as Class).superInterfaces?.map(c => c.ref?.name)?.join('\n')}
            `
        ).toBe(s`
            Types:
              I
              A
              B
            Super-Types of B:
              A
              I
        `);
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
