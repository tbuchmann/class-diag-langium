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

    test('parse model with abstract class', async () => {
        document = await parse(`
            package de {
                abstract class Test {}
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Class:
              ${document.parseResult.value?.packages?.[0].types?.[0].name} ${(document.parseResult.value?.packages?.[0].types?.[0] as Class).abstract ? 'abstract' : ''}
            `
        ).toBe(s`
            Class:
              Test abstract
        `);
    });

    test('parse model with static properties and operations', async () => {
        document = await parse(`
            package de {
                class Test {
                    static a : Integer
                    static doSmth(test : String) : Integer {}
                }
            }
        `);        

        expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            checkDocumentValid(document) || s`
            Class:
              ${document.parseResult.value?.packages?.[0].types?.[0].name}
            Static Properties:
              ${(document.parseResult.value?.packages?.[0].types?.[0] as Class).properties?.filter(p => p.$type == 'Property' && p.static).map(p => p.name)?.join('\n')}
            Static Operations:
              ${(document.parseResult.value?.packages?.[0].types?.[0] as Class).operations?.filter(o => o.$type == 'Operation' && o.static).map(o => o.name)?.join('\n')}
            `
        ).toBe(s`
            Class:
              Test
            Static Properties:
              a
            Static Operations:
              doSmth
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
                        datatype TestDT {}
                        primitive TestPT
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
                primitive Integer
                primitive String
                class Test {
                    public a : Integer
                    private b : String
                    c : String
                    protected doSmth(test : String) : Integer {}
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
              ${(document.parseResult.value?.packages?.[0].types?.[2] as Association).properties?.map(a => a.name + ":" + a.type?.ref?.name)?.join('\n')}
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

// ---------------------------------------------------------------------------
// Iteration 2.1 – STEREOTYPE-Terminal
// ---------------------------------------------------------------------------
describe('Stereotype parsing', () => {

    test('@dto datatype is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                @dto datatype Req { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].types[0] as any;
        expect(dt.stereotype).toBe('@dto');
    });

    test('datatype without stereotype has undefined stereotype', async () => {
        const doc = await parse(`
            package test {
                datatype Addr { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].types[0] as any;
        expect(dt.stereotype).toBeUndefined();
    });

    test('@joined abstract class is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                abstract @joined class Base { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as any;
        expect(clz.stereotype).toBe('@joined');
        expect(clz.abstract).toBe(true);
    });

    test('@ignore class is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                @ignore class Helper { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as any;
        expect(clz.stereotype).toBe('@ignore');
    });

    test('@service interface is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                @service interface OrderService { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const iface = doc.parseResult.value.packages[0].types[0] as any;
        expect(iface.stereotype).toBe('@service');
    });

    test('plain class without stereotype is unaffected', async () => {
        const doc = await parse(`
            package test {
                primitive String
                class Customer {
                    name : String
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types.find((t: any) => t.$type === 'Class') as any;
        expect(clz.stereotype).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Iteration 1 – @rest annotation parsing
// ---------------------------------------------------------------------------
describe('REST annotation parsing', () => {

    test('@rest with path on interface is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                primitive String
                @rest path="/customers"
                interface CustomerService {
                    findAll() : String {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const iface = doc.parseResult.value.packages[0].types[1] as any;
        expect(iface.restAnnotation).toBeDefined();
        expect(iface.restAnnotation.path).toBe('/customers');
    });

    test('@rest without path on interface is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                @rest
                interface CustomerService {
                    findAll() : String {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const iface = doc.parseResult.value.packages[0].types[0] as any;
        expect(iface.restAnnotation).toBeDefined();
        expect(iface.restAnnotation.path).toBeUndefined();
    });

    test('@rest with path on class is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                primitive String
                @rest path="/api"
                class CustomerResource {
                    findAll() : String {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[1] as any;
        expect(clz.restAnnotation).toBeDefined();
        expect(clz.restAnnotation.path).toBe('/api');
    });

    test('class without @rest has undefined restAnnotation', async () => {
        const doc = await parse(`
            package test {
                class Customer { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as any;
        expect(clz.restAnnotation).toBeUndefined();
    });

    test('interface without @rest has undefined restAnnotation', async () => {
        const doc = await parse(`
            package test {
                interface CustomerService { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const iface = doc.parseResult.value.packages[0].types[0] as any;
        expect(iface.restAnnotation).toBeUndefined();
    });

    test('@rest with stereotype on class is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                abstract @entity @rest path="/base"
                class BaseEntity { }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as any;
        expect(clz.stereotype).toBe('@entity');
        expect(clz.restAnnotation).toBeDefined();
        expect(clz.restAnnotation.path).toBe('/base');
    });
});

// ---------------------------------------------------------------------------
// Item 7 – preAuthorize parsing
// ---------------------------------------------------------------------------
describe('preAuthorize parsing', () => {

    test('operation with preAuthorize is parsed correctly', async () => {
        const doc = await parse(`
            package test {
                primitive String
                interface Service {
                    find() : String {
                        preAuthorize "hasRole('ADMIN')"
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const iface = doc.parseResult.value.packages[0].types[1] as any;
        const op = iface.operations[0];
        expect(op.preAuthorize).toBe("hasRole('ADMIN')");
    });

    test('operation without preAuthorize has undefined', async () => {
        const doc = await parse(`
            package test {
                primitive String
                interface Service {
                    find() : String {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const iface = doc.parseResult.value.packages[0].types[1] as any;
        const op = iface.operations[0];
        expect(op.preAuthorize).toBeUndefined();
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

function diagnosticToString(d: Diagnostic) : string {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
