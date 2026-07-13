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

// ---------------------------------------------------------------------------
// Iteration 2.7 – Validator-Warnungen
// ---------------------------------------------------------------------------
describe('checkImplicitManyToOne', () => {

    test('Class-typed property without explicit assoc produces warning', async () => {
        document = await parse(`
            package test {
                class Order { }
                class LineItem {
                    order : Order
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("Property 'order'") && m.includes('implicit @ManyToOne'))).toBe(true);
    });

    test('Class-typed property covered by explicit assoc produces no warning', async () => {
        document = await parse(`
            package test {
                class Order { }
                class LineItem {
                    order : Order
                }
                assoc OrderItems {
                    lineItems : LineItem [0..-1]
                    order : Order
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("Property 'order'") && m.includes('implicit @ManyToOne'))).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// Iteration 2.8 – E2E-Validator (alle Phase-2-Warnungen kombiniert)
// ---------------------------------------------------------------------------
describe('E2E validator – Phase 2 combined model', () => {

    test('Vollständiges Phase-2-Modell hat keine unerwarteten Fehler', async () => {
        document = await parse(`
            package com {
                package example {
                    primitive String
                    primitive Long
                    primitive Boolean

                    abstract @joined class Vehicle {
                        brand : String
                    }

                    class Car extends Vehicle {
                        seats : Long
                    }

                    @mappedsuperclass class AuditBase {
                        createdBy : String
                    }

                    @ignore class InternalHelper { }

                    @embeddable class Address {
                        street : String
                    }

                    @dto datatype CreateCarRequest {
                        brand : String
                    }

                    @response datatype CarListResponse {
                        items : String [0..-1]
                    }

                    interface CarService {
                        findById(id : Long) : Long {}
                    }

                    assoc VehicleAddress {
                        vehicle : Vehicle [0..-1]
                        address : Address
                    }
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        // No @error-level diagnostics expected
        const errors = document?.diagnostics?.filter(d => d.severity === 1) ?? [];
        expect(errors).toHaveLength(0);
    });

    test('Explicit assoc verhindert implicit-ManyToOne-Warnung im kombinierten Modell', async () => {
        document = await parse(`
            package com {
                package example {
                    primitive String
                    class Department { name : String }
                    class Employee {
                        dept : Department
                    }
                    assoc EmpDept {
                        employees : Employee [0..-1]
                        dept : Department
                    }
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("Property 'dept'") && m.includes('implicit @ManyToOne'))).toBe(false);
    });
});
describe('checkDtoPackageConvention', () => {

    test('DataType in dto package without stereotype produces hint', async () => {
        document = await parse(`
            package test {
                package dto {
                    primitive String
                    datatype SearchReq {
                        query : String
                    }
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("SearchReq") && m.includes('@dto'))).toBe(true);
    });

    test('DataType in dto package with @dto stereotype produces no hint', async () => {
        document = await parse(`
            package test {
                package dto {
                    primitive String
                    @dto datatype SearchReq {
                        query : String
                    }
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("SearchReq") && m.includes('should carry a @dto'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Iteration 1 – REST annotation validation
// ---------------------------------------------------------------------------
describe('REST annotation validation', () => {

    test('@rest path without leading slash produces error', async () => {
        document = await parse(`
            package test {
                @rest path="customers"
                interface CustomerService {
                    findAll() : String {}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("REST path must start with '/"))).toBe(true);
    });

    test('@rest with valid path produces no path error', async () => {
        document = await parse(`
            package test {
                @rest path="/customers"
                interface CustomerService {
                    findAll() : String {}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes("REST path must start with '/"))).toBe(false);
    });

    test('@rest interface without operations produces warning', async () => {
        document = await parse(`
            package test {
                @rest path="/empty"
                interface EmptyService { }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes('has no operations'))).toBe(true);
    });

    test('@rest interface with operations produces no empty warning', async () => {
        document = await parse(`
            package test {
                primitive String
                @rest path="/customers"
                interface CustomerService {
                    findAll() : String {}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes('has no operations'))).toBe(false);
    });

    test('unmappable operation signature produces hint', async () => {
        document = await parse(`
            package test {
                primitive Str
                primitive Long
                @rest path="/customers"
                interface CustomerService {
                    findNothing() : Str {}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes('does not match a known REST pattern'))).toBe(true);
    });

    test('mappable operation signature produces no hint', async () => {
        document = await parse(`
            package test {
                primitive Str
                primitive Long
                @rest path="/customers"
                interface CustomerService {
                    findAll() : Str [0..-1] {}
                    findById(id : Long) : Str {}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const msgs = document?.diagnostics?.map(d => d.message) ?? [];
        expect(msgs.some(m => m.includes('does not match a known REST pattern'))).toBe(false);
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
