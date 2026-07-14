import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { createClassDiagramServices } from "../../src/language/class-diagram-module.js";
import { Enumeration, DataType, Class, Model } from "../../src/language/generated/ast.js";
import { toSnakeCase, printSpringType, generateJpaEnum, generateEmbeddable, generateJpaEntity, generateSpringRepository, generateSpringCode, getStereotype, generateDto, isDtoType } from "../../src/cli/generatorSpring.js";
import { generateService } from "../../src/cli/generatorService.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createClassDiagramServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.ClassDiagram);
});

// ---------------------------------------------------------------------------
// Iteration 1.1 – toSnakeCase
// ---------------------------------------------------------------------------
describe('toSnakeCase', () => {
    test('single word lower', () => expect(toSnakeCase('Customer')).toBe('customer'));
    test('PascalCase two words', () => expect(toSnakeCase('CustomerOrder')).toBe('customer_order'));
    test('SQL reserved word gets suffix', () => expect(toSnakeCase('Order')).toBe('order_'));
    test('SQL reserved word "user"', () => expect(toSnakeCase('User')).toBe('user_'));
    test('already lower non-reserved', () => expect(toSnakeCase('invoice')).toBe('invoice'));
    test('acronym prefix', () => expect(toSnakeCase('HTTPResponse')).toBe('http_response'));
});

// ---------------------------------------------------------------------------
// Iteration 1.1 – printSpringType
// ---------------------------------------------------------------------------
describe('printSpringType', () => {
    test('undefined returns empty string', () => expect(printSpringType(undefined)).toBe(''));

    test('primitive String maps to String', async () => {
        const doc = await parse(`
            package test {
                primitive String
                class A { name : String }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types.find(t => t.$type === 'Class') as any;
        const prop = clz.properties[0];
        expect(printSpringType(prop)).toBe('String');
    });

    test('primitive Date maps to LocalDate', async () => {
        const doc = await parse(`
            package test {
                primitive Date
                class A { created : Date }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types.find(t => t.$type === 'Class') as any;
        const prop = clz.properties[0];
        expect(printSpringType(prop)).toBe('LocalDate');
    });

    test('multi-value property yields List<T>', async () => {
        const doc = await parse(`
            package test {
                primitive String
                class A { tags : String [0..-1] }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types.find(t => t.$type === 'Class') as any;
        const prop = clz.properties[0];
        expect(printSpringType(prop)).toBe('List<String>');
    });
});

// ---------------------------------------------------------------------------
// Iteration 1.2 – generateJpaEnum
// ---------------------------------------------------------------------------
describe('generateJpaEnum', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'springgen-'));
    });

    test('enum with literals generates correct Java file', async () => {
        const doc = await parse(`
            package com {
                package example {
                    enum OrderStatus {
                        PENDING, CONFIRMED, SHIPPED, CANCELLED
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);

        const enumType = doc.parseResult.value.packages[0].packages[0].types[0] as Enumeration;
        const outFile = generateJpaEnum(enumType, 'model.cdiag', tmpDir);

        expect(fs.existsSync(outFile)).toBe(true);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('package com.example.domain;');
        expect(content).toContain('public enum OrderStatus');
        expect(content).toContain('PENDING');
        expect(content).toContain('CONFIRMED');
        expect(content).toContain('SHIPPED');
        expect(content).toContain('CANCELLED');
        // No JPA annotations on the enum itself
        expect(content).not.toContain('@Entity');
        expect(content).not.toContain('@Embeddable');
    });

    test('enum output file is located in domain/ subfolder', async () => {
        const doc = await parse(`
            package org {
                package acme {
                    enum Color { RED, GREEN, BLUE }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const enumType = doc.parseResult.value.packages[0].packages[0].types[0] as Enumeration;
        const outFile = generateJpaEnum(enumType, 'model.cdiag', tmpDir);

        expect(outFile).toContain(path.join('org', 'acme', 'domain', 'Color.java'));
    });
});

// ---------------------------------------------------------------------------
// Iteration 1.3 – generateEmbeddable
// ---------------------------------------------------------------------------
describe('generateEmbeddable', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'springgen-embeddable-'));
    });

    test('@Embeddable annotation and class declaration', async () => {
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    datatype Address {
                        street : String
                        city : String
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].packages[0].types
            .find(t => t.$type === 'DataType') as DataType;
        const outFile = generateEmbeddable(dt, 'model.cdiag', tmpDir);

        expect(fs.existsSync(outFile)).toBe(true);
        const content = fs.readFileSync(outFile, 'utf-8');
        expect(content).toContain('@Embeddable');
        expect(content).toContain('public class Address');
        expect(content).toContain('package com.example.domain;');
    });

    test('fields get @Column annotation with snake_case name', async () => {
        const doc = await parse(`
            package app {
                primitive String
                datatype MoneyAmount {
                    currencyCode : String
                    rawValue : String
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'DataType') as DataType;
        const outFile = generateEmbeddable(dt, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@Column(name = "currency_code")');
        expect(content).toContain('@Column(name = "raw_value")');
        expect(content).toContain('private String currencyCode;');
        expect(content).toContain('private String rawValue;');
    });

    test('getter and setter generated for each field', async () => {
        const doc = await parse(`
            package app {
                primitive String
                datatype GeoPoint {
                    latitude : String
                    longitude : String
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'DataType') as DataType;
        const outFile = generateEmbeddable(dt, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('getLatitude()');
        expect(content).toContain('setLatitude(');
        expect(content).toContain('getLongitude()');
        expect(content).toContain('setLongitude(');
    });

    test('no-arg constructor present', async () => {
        const doc = await parse(`
            package app {
                primitive String
                datatype Tag {
                    label : String
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'DataType') as DataType;
        const outFile = generateEmbeddable(dt, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');
        expect(content).toContain('public Tag()');
    });

    test('output file placed in domain/ subfolder', async () => {
        const doc = await parse(`
            package geo {
                package example {
                    primitive String
                    datatype Coordinate {
                        posX : String
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const dt = doc.parseResult.value.packages[0].packages[0].types
            .find(t => t.$type === 'DataType') as DataType;
        const outFile = generateEmbeddable(dt, 'model.cdiag', tmpDir);
        expect(outFile).toContain(path.join('geo', 'example', 'domain', 'Coordinate.java'));
    });
});

// ---------------------------------------------------------------------------
// Iteration 1.4 – generateJpaEntity
// ---------------------------------------------------------------------------
describe('generateJpaEntity', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'springgen-entity-'));
    });

    test('concrete class gets @Entity and @Table with snake_case name', async () => {
        const doc = await parse(`
            package shop {
                class CustomerOrder {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@Entity');
        expect(content).toContain('@Table(name = "customer_order")');
        expect(content).toContain('public class CustomerOrder');
        expect(content).not.toContain('@MappedSuperclass');
    });

    test('abstract class gets @MappedSuperclass', async () => {
        const doc = await parse(`
            package shop {
                abstract class BaseEntity {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@MappedSuperclass');
        expect(content).toContain('public abstract class BaseEntity');
        expect(content).not.toContain('@Entity');
    });

    test('auto-generated id field when no id in model', async () => {
        const doc = await parse(`
            package shop {
                class Product {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@Id');
        expect(content).toContain('@GeneratedValue(strategy = GenerationType.IDENTITY)');
        expect(content).toContain('private Long id;');
        expect(content).toContain('getId()');
        expect(content).toContain('setId(');
    });

    test('explicit id property gets @Id @GeneratedValue, no duplicate', async () => {
        const doc = await parse(`
            package shop {
                primitive Long
                class Invoice {
                    id : Long
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class') as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        // @Id must appear exactly once
        expect(content.split('@Id').length - 1).toBe(1);
        expect(content).toContain('@GeneratedValue(strategy = GenerationType.IDENTITY)');
    });

    test('explicit id property of type String is coerced to Long', async () => {
        const doc = await parse(`
            package shop {
                primitive String
                class Invoice {
                    id : String
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class') as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('private Long id;');
        expect(content).toContain('public Long getId() {');
        expect(content).toContain('public void setId(Long id) {');
        expect(content).not.toContain('public String getId()');
        expect(content).not.toContain('public void setId(String');
    });

    test('PrimitiveType property gets @Column with snake_case name', async () => {
        const doc = await parse(`
            package shop {
                primitive String
                class Article {
                    articleName : String
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class') as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@Column(name = "article_name")');
        expect(content).toContain('private String articleName;');
    });

    test('DataType property gets @Embedded', async () => {
        const doc = await parse(`
            package shop {
                primitive String
                datatype PostalAddress { street : String }
                class Customer {
                    address : PostalAddress
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class') as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@Embedded');
        expect(content).toContain('private PostalAddress address;');
    });

    test('Enumeration property gets @Enumerated(EnumType.STRING)', async () => {
        const doc = await parse(`
            package shop {
                enum Status { ACTIVE, INACTIVE }
                class Account {
                    status : Status
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class') as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('@Enumerated(EnumType.STRING)');
        expect(content).toContain('private Status status;');
    });

    test('Class-typed property without explicit assoc becomes implicit @ManyToOne', async () => {
        const doc = await parse(`
            package shop {
                class Owner {}
                class Pet {
                    owner : Owner
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const pet = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class' && (t as Class).name === 'Pet') as Class;
        const outFile = generateJpaEntity(pet, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        // implicit @ManyToOne is generated (not skipped)
        expect(content).toContain('@ManyToOne');
        expect(content).toContain('private Owner owner');
    });

    test('subclass has extends clause, no duplicate id', async () => {
        const doc = await parse(`
            package shop {
                primitive Long
                abstract class BaseEntity {
                    id : Long
                }
                class Supplier extends BaseEntity {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const sub = doc.parseResult.value.packages[0].types
            .find(t => t.$type === 'Class' && (t as Class).name === 'Supplier') as Class;
        const outFile = generateJpaEntity(sub, doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('extends BaseEntity');
        // id must not be duplicated in subclass
        expect(content).not.toContain('private Long id;');
    });

    test('output file placed in domain/ subfolder', async () => {
        const doc = await parse(`
            package acme {
                package retail {
                    class Warehouse {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].packages[0].types[0] as Class;
        const outFile = generateJpaEntity(clz, doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(outFile).toContain(path.join('acme', 'retail', 'domain', 'Warehouse.java'));
    });
});

// ---------------------------------------------------------------------------
// Iteration 1.5 – Associations: @OneToMany / @ManyToOne / @JsonIgnore
// ---------------------------------------------------------------------------
describe('generateJpaEntity – associations', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'springgen-assoc-'));
    });

    test('@ManyToOne on the FK-owner side, @OneToMany(mappedBy) on the collection side', async () => {
        const doc = await parse(`
            package shop {
                class Order {}
                class OrderItem {}
                assoc orderItems {
                    theOrder : Order
                    items : OrderItem [0..-1]
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        const order     = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'Order')     as Class;
        const orderItem = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'OrderItem') as Class;

        const orderContent     = fs.readFileSync(generateJpaEntity(order,     model, 'model.cdiag', tmpDir), 'utf-8');
        const orderItemContent = fs.readFileSync(generateJpaEntity(orderItem, model, 'model.cdiag', tmpDir), 'utf-8');

        // Order gets the @OneToMany collection
        expect(orderContent).toContain('@OneToMany(mappedBy = "theOrder")');
        expect(orderContent).toContain('List<OrderItem> items');

        // OrderItem gets @ManyToOne with FK column
        expect(orderItemContent).toContain('@ManyToOne');
        expect(orderItemContent).toContain('@JoinColumn(name = "the_order_id")');
        expect(orderItemContent).toContain('private Order theOrder');
    });

    test('@OneToMany with cascade ALL and orphanRemoval for composite aggregation', async () => {
        const doc = await parse(`
            package shop {
                class Invoice {}
                class LineItem {}
                assoc invoiceLines {
                    invoice : Invoice
                    lines : LineItem [0..-1] composite
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        const invoice = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'Invoice') as Class;
        const content = fs.readFileSync(generateJpaEntity(invoice, model, 'model.cdiag', tmpDir), 'utf-8');

        expect(content).toContain('cascade = CascadeType.ALL');
        expect(content).toContain('orphanRemoval = true');
    });

    test('@JsonIgnore on the notnavigable side', async () => {
        const doc = await parse(`
            package shop {
                class Parent {}
                class Child {}
                assoc parentChild {
                    parent : Parent
                    children : Child [0..-1] x
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        const parent = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'Parent') as Class;
        const child  = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'Child')  as Class;

        const parentContent = fs.readFileSync(generateJpaEntity(parent, model, 'model.cdiag', tmpDir), 'utf-8');
        const childContent  = fs.readFileSync(generateJpaEntity(child,  model, 'model.cdiag', tmpDir), 'utf-8');

        // children is marked notnavigable (x) → @JsonIgnore in Parent
        expect(parentContent).toContain('@JsonIgnore');
        expect(parentContent).toContain('import com.fasterxml.jackson.annotation.JsonIgnore;');
        // child does NOT have @JsonIgnore
        expect(childContent).not.toContain('@JsonIgnore');
    });

    test('implicit @ManyToOne for Class-typed property without explicit assoc', async () => {
        const doc = await parse(`
            package shop {
                class Category {}
                class Product {
                    category : Category
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        const product = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'Product') as Class;
        const content = fs.readFileSync(generateJpaEntity(product, model, 'model.cdiag', tmpDir), 'utf-8');

        expect(content).toContain('// WARN: implicit @ManyToOne');
        expect(content).toContain('@ManyToOne');
        expect(content).toContain('@JoinColumn(name = "category_id")');
        expect(content).toContain('private Category category');
    });

    test('@OneToOne mapping for single-to-single association', async () => {
        const doc = await parse(`
            package shop {
                class Passport {}
                class Person {}
                assoc personPassport {
                    person : Person
                    passport : Passport
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        const person = model.packages[0].types.find(t => t.$type === 'Class' && (t as Class).name === 'Person') as Class;
        const content = fs.readFileSync(generateJpaEntity(person, model, 'model.cdiag', tmpDir), 'utf-8');

        expect(content).toContain('@OneToOne');
        expect(content).toContain('@JoinColumn(name = "passport_id")');
        expect(content).toContain('private Passport passport');
    });
});

// ---------------------------------------------------------------------------
// Iteration 1.6 – Repository generator
// ---------------------------------------------------------------------------
describe('generateSpringRepository', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'springgen-repo-'));
    });

    test('interface extends JpaRepository with correct type parameters', async () => {
        const doc = await parse(`
            package shop {
                class Product {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as Class;
        const outFile = generateSpringRepository(clz, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('public interface ProductRepository extends JpaRepository<Product, Long>');
    });

    test('correct package declaration in repository subfolder', async () => {
        const doc = await parse(`
            package com {
                package example {
                    class Order {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].packages[0].types[0] as Class;
        const outFile = generateSpringRepository(clz, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('package com.example.repository;');
    });

    test('imports JpaRepository and domain class', async () => {
        const doc = await parse(`
            package acme {
                class Customer {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as Class;
        const outFile = generateSpringRepository(clz, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(outFile, 'utf-8');

        expect(content).toContain('import org.springframework.data.jpa.repository.JpaRepository;');
        expect(content).toContain('import acme.domain.Customer;');
    });

    test('output file placed in repository/ subfolder', async () => {
        const doc = await parse(`
            package acme {
                package retail {
                    class Warehouse {}
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].packages[0].types[0] as Class;
        const outFile = generateSpringRepository(clz, 'model.cdiag', tmpDir);
        expect(outFile).toContain(path.join('acme', 'retail', 'repository', 'WarehouseRepository.java'));
    });

    test('abstract class does NOT get a repository (only via generateSpringCode dispatch)', async () => {
        // generateSpringRepository itself does not guard abstract — the guard is in generateSpringCode.
        // But we verify that a concrete class gets a repository file with proper name.
        const doc = await parse(`
            package shop {
                class Supplier {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const clz = doc.parseResult.value.packages[0].types[0] as Class;
        const outFile = generateSpringRepository(clz, 'model.cdiag', tmpDir);
        expect(path.basename(outFile)).toBe('SupplierRepository.java');
    });
});

// ---------------------------------------------------------------------------
// Iteration 1.8 – End-to-End: generateSpringCode auf vollständigem Modell
// ---------------------------------------------------------------------------
describe('E2E – generateSpringCode (complete model)', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'springgen-e2e-'));
    });

    test('all expected files are generated and contain correct content', async () => {
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    primitive Integer
                    enum OrderStatus { PENDING, CONFIRMED, SHIPPED, CANCELLED }
                    datatype Address { street : String  city : String }
                    class Customer { name : String  email : String }
                    class Order { status : OrderStatus  quantity : Integer }
                    assoc CustomerOrders {
                        customer : Customer [0..1]
                        orders : Order [0..-1]
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        generateSpringCode(model, 'model.cdiag', tmpDir);

        const domainDir = path.join(tmpDir, 'com', 'example', 'domain');
        const repoDir   = path.join(tmpDir, 'com', 'example', 'repository');

        // --- enum ---
        const enumContent = fs.readFileSync(path.join(domainDir, 'OrderStatus.java'), 'utf-8');
        expect(enumContent).toContain('package com.example.domain');
        expect(enumContent).toContain('public enum OrderStatus');
        expect(enumContent).toContain('PENDING, CONFIRMED, SHIPPED, CANCELLED');

        // --- @Embeddable ---
        const addressContent = fs.readFileSync(path.join(domainDir, 'Address.java'), 'utf-8');
        expect(addressContent).toContain('@Embeddable');
        expect(addressContent).toContain('private String street');
        expect(addressContent).toContain('private String city');

        // --- Customer entity ---
        const customerContent = fs.readFileSync(path.join(domainDir, 'Customer.java'), 'utf-8');
        expect(customerContent).toContain('@Entity');
        expect(customerContent).toContain('@Table(name = "customer")');
        expect(customerContent).toContain('@Id');
        expect(customerContent).toContain('private String name');
        expect(customerContent).toContain('private String email');
        // association: Customer is the inverse (@OneToMany) side
        expect(customerContent).toContain('@OneToMany(mappedBy = "customer")');
        expect(customerContent).toContain('List<Order> orders');

        // --- Order entity – "order" is a SQL reserved word → table name "order_" ---
        const orderContent = fs.readFileSync(path.join(domainDir, 'Order.java'), 'utf-8');
        expect(orderContent).toContain('@Entity');
        expect(orderContent).toContain('@Table(name = "order_")');
        expect(orderContent).toContain('@Enumerated(EnumType.STRING)');
        expect(orderContent).toContain('private OrderStatus status');
        expect(orderContent).toContain('private Integer quantity');
        // association: Order is the FK-owner (@ManyToOne) side
        expect(orderContent).toContain('@ManyToOne');
        expect(orderContent).toContain('@JoinColumn(name = "customer_id")');
        expect(orderContent).toContain('private Customer customer');

        // --- CustomerRepository ---
        const customerRepoContent = fs.readFileSync(path.join(repoDir, 'CustomerRepository.java'), 'utf-8');
        expect(customerRepoContent).toContain('package com.example.repository');
        expect(customerRepoContent).toContain('import com.example.domain.Customer');
        expect(customerRepoContent).toContain('extends JpaRepository<Customer, Long>');

        // --- OrderRepository ---
        const orderRepoContent = fs.readFileSync(path.join(repoDir, 'OrderRepository.java'), 'utf-8');
        expect(orderRepoContent).toContain('package com.example.repository');
        expect(orderRepoContent).toContain('import com.example.domain.Order');
        expect(orderRepoContent).toContain('extends JpaRepository<Order, Long>');
    });

    test('abstract class has no repository but concrete subclass does', async () => {
        const doc = await parse(`
            package shop {
                primitive Long
                abstract class BaseEntity { id : Long }
                class Article extends BaseEntity {}
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const model = doc.parseResult.value;
        generateSpringCode(model, 'model.cdiag', tmpDir);

        const domainDir = path.join(tmpDir, 'shop', 'domain');
        const repoDir   = path.join(tmpDir, 'shop', 'repository');

        // Abstract base → @MappedSuperclass, no repository file
        const baseContent = fs.readFileSync(path.join(domainDir, 'BaseEntity.java'), 'utf-8');
        expect(baseContent).toContain('@MappedSuperclass');
        expect(baseContent).not.toContain('@Entity');
        expect(fs.existsSync(path.join(repoDir, 'BaseEntityRepository.java'))).toBe(false);

        // Concrete subclass → @Entity + repository file
        const articleContent = fs.readFileSync(path.join(domainDir, 'Article.java'), 'utf-8');
        expect(articleContent).toContain('@Entity');
        expect(articleContent).toContain('extends BaseEntity');
        // id should NOT be duplicated in subclass (superclass already has it)
        expect(articleContent).not.toContain('private Long id');
        expect(fs.existsSync(path.join(repoDir, 'ArticleRepository.java'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Iteration 2.2 – @ignore und @mappedsuperclass
// ---------------------------------------------------------------------------
describe('getStereotype helper', () => {
    test('extracts stereotype name without @', async () => {
        const doc = await parse(`
            package test {
                @dto datatype Foo { }
            }
        `);
        const dt = doc.parseResult.value.packages[0].types[0] as DataType;
        expect(getStereotype(dt)).toBe('dto');
    });

    test('returns undefined when no stereotype', async () => {
        const doc = await parse(`
            package test {
                datatype Foo { }
            }
        `);
        const dt = doc.parseResult.value.packages[0].types[0] as DataType;
        expect(getStereotype(dt)).toBeUndefined();
    });
});

describe('Iteration 2.2 – @ignore dispatch', () => {
    let tmpDir: string;

    beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it22-')); });

    test('@ignore class produces no file', async () => {
        const doc = await parse(`
            package com {
                package example {
                    @ignore class Helper { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const domainDir = path.join(tmpDir, 'com', 'example', 'domain');
        const helperFile = path.join(domainDir, 'Helper.java');
        expect(fs.existsSync(helperFile)).toBe(false);
    });

    test('@ignore datatype produces no file', async () => {
        const doc = await parse(`
            package com {
                package example {
                    @ignore datatype TmpData { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const domainDir = path.join(tmpDir, 'com', 'example', 'domain');
        expect(fs.existsSync(path.join(domainDir, 'TmpData.java'))).toBe(false);
    });

    test('@mappedsuperclass produces @MappedSuperclass, no repository', async () => {
        const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it22b-'));
        const doc = await parse(`
            package com {
                package example {
                    @mappedsuperclass class BaseEntity { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir2);
        const domainDir = path.join(tmpDir2, 'com', 'example', 'domain');
        const content = fs.readFileSync(path.join(domainDir, 'BaseEntity.java'), 'utf-8');
        expect(content).toContain('@MappedSuperclass');
        expect(content).not.toContain('@Entity');
        const repoDir = path.join(tmpDir2, 'com', 'example', 'repository');
        expect(fs.existsSync(path.join(repoDir, 'BaseEntityRepository.java'))).toBe(false);
    });

    test('abstract class without stereotype still @MappedSuperclass (regression)', async () => {
        const tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it22c-'));
        const doc = await parse(`
            package com {
                package example {
                    abstract class AuditBase { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir3);
        const content = fs.readFileSync(
            path.join(tmpDir3, 'com', 'example', 'domain', 'AuditBase.java'), 'utf-8'
        );
        expect(content).toContain('@MappedSuperclass');
        expect(content).not.toContain('@Entity');
        const repoDir = path.join(tmpDir3, 'com', 'example', 'repository');
        expect(fs.existsSync(path.join(repoDir, 'AuditBaseRepository.java'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Iteration 2.3 – @entity und @joined (Inheritance-Strategie)
// ---------------------------------------------------------------------------
describe('Iteration 2.3 – @entity / @joined inheritance', () => {

    test('abstract @entity class gets @Entity + SINGLE_TABLE inheritance', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it23a-'));
        const doc = await parse(`
            package com {
                package example {
                    abstract @entity class Vehicle { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Vehicle.java'), 'utf-8'
        );
        expect(content).toContain('@Entity');
        expect(content).toContain('@Inheritance(strategy = InheritanceType.SINGLE_TABLE)');
        expect(content).not.toContain('@MappedSuperclass');
    });

    test('abstract @entity class produces a repository', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it23b-'));
        const doc = await parse(`
            package com {
                package example {
                    abstract @entity class Vehicle { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'example', 'repository', 'VehicleRepository.java')
        )).toBe(true);
    });

    test('abstract @joined class gets @Entity + JOINED inheritance', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it23c-'));
        const doc = await parse(`
            package com {
                package example {
                    abstract @joined class Animal { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Animal.java'), 'utf-8'
        );
        expect(content).toContain('@Entity');
        expect(content).toContain('@Inheritance(strategy = InheritanceType.JOINED)');
        expect(content).not.toContain('@MappedSuperclass');
    });

    test('plain abstract class without stereotype stays @MappedSuperclass, no repository (regression)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it23d-'));
        const doc = await parse(`
            package com {
                package example {
                    abstract class Audit { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Audit.java'), 'utf-8'
        );
        expect(content).toContain('@MappedSuperclass');
        expect(content).not.toContain('@Entity');
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'example', 'repository', 'AuditRepository.java')
        )).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Iteration 2.4 – @embeddable auf Class
// ---------------------------------------------------------------------------
describe('Iteration 2.4 – @embeddable class', () => {

    test('@embeddable class gets @Embeddable annotation, no @Entity', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it24a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    @embeddable class Address {
                        street : String
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Address.java'), 'utf-8'
        );
        expect(content).toContain('@Embeddable');
        expect(content).not.toContain('@Entity');
    });

    test('@embeddable class produces no repository', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it24b-'));
        const doc = await parse(`
            package com {
                package example {
                    @embeddable class Money { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'example', 'repository', 'MoneyRepository.java')
        )).toBe(false);
    });

    test('@embeddable class output placed in domain/ subfolder', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it24c-'));
        const doc = await parse(`
            package com {
                package example {
                    @embeddable class Geo { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Geo.java')
        )).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Iteration 2.5 – DTO-Generator
// ---------------------------------------------------------------------------
describe('Iteration 2.5 – DTO generator', () => {

    test('@dto datatype generates a Java record without JPA imports', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it25a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    @dto datatype CreateOrderReq {
                        customerName : String
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'dto', 'CreateOrderReq.java'), 'utf-8'
        );
        expect(content).toContain('public record CreateOrderReq(String customerName)');
        expect(content).not.toContain('import jakarta.persistence');
        expect(content).not.toContain('@Entity');
        expect(content).not.toContain('@Embeddable');
    });

    test('@response datatype with List<T> property generates correct record', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it25b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    @response datatype OrderListRes {
                        items : String [0..-1]
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'dto', 'OrderListRes.java'), 'utf-8'
        );
        expect(content).toContain('List<String> items');
        expect(content).toContain('import java.util.List;');
    });

    test('DataType in a dto-named package without stereotype also generates record', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it25c-'));
        const doc = await parse(`
            package com {
                package example {
                    package dto {
                        primitive String
                        datatype SearchReq {
                            query : String
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'example', 'dto', 'dto', 'SearchReq.java')
        )).toBe(true);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'dto', 'dto', 'SearchReq.java'), 'utf-8'
        );
        expect(content).toContain('public record SearchReq(');
    });

    test('DTO output path ends in dto/<Name>.java', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it25d-'));
        const doc = await parse(`
            package com {
                package acme {
                    @request datatype LoginReq { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'acme', 'dto', 'LoginReq.java')
        )).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Iteration 2.6 – Service-Generator
// ---------------------------------------------------------------------------
describe('Iteration 2.6 – Service generator', () => {

    test('Interface with operations generates @Service impl with @Override stubs', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it26a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    primitive Long
                    interface OrderService {
                        findById(id : Long) : Long {}
                        cancel(id : Long) {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'OrderServiceImpl.java'), 'utf-8'
        );
        expect(content).toContain('@Service');
        expect(content).toContain('implements OrderService');
        expect(content).toContain('@Override');
        // two methods
        expect((content.match(/@Override/g) ?? []).length).toBe(2);
    });

    test('Operation with spec-description produces Javadoc @prompt comment', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it26b-'));
        const doc = await parse(`
            package com {
                package acme {
                    primitive String
                    interface ReportService {
                        generate(name : String) {
                            spec "Generates a PDF report"
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'acme', 'service', 'ReportServiceImpl.java'), 'utf-8'
        );
        expect(content).toContain('* @prompt Generates a PDF report');
    });

    test('Operation without return type generates void method', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it26c-'));
        const doc = await parse(`
            package com {
                package acme {
                    primitive Long
                    interface TaskService {
                        delete(id : Long) {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'acme', 'service', 'TaskServiceImpl.java'), 'utf-8'
        );
        expect(content).toContain('public void delete(');
    });

    test('Interface without operations produces no service file', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it26d-'));
        const doc = await parse(`
            package com {
                package acme {
                    interface Marker { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'acme', 'service', 'MarkerImpl.java')
        )).toBe(false);
    });

    test('Service output path ends in service/<Name>Impl.java', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it26e-'));
        const doc = await parse(`
            package com {
                package acme {
                    primitive String
                    interface AuthService {
                        login(user : String) {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(
            path.join(tmpDir, 'com', 'acme', 'service', 'AuthServiceImpl.java')
        )).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Iteration 2 – Richer service generator
// ---------------------------------------------------------------------------
describe('Iteration 2 – Richer service generator', () => {

    test('Service with CRUD operations generates repository injection and CRUD bodies', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it2a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Customer {
                        name : String
                    }
                    interface CustomerService {
                        findAll() : String [0..-1] {}
                        findById(id : Long) : String {}
                        save(customer : Customer) : Customer {}
                        deleteById(id : Long) {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'CustomerServiceImpl.java'), 'utf-8'
        );

        // Constructor injection
        expect(content).toContain('private final CustomerRepository customerRepository;');
        expect(content).toContain('public CustomerServiceImpl(CustomerRepository customerRepository)');
        expect(content).toContain('this.customerRepository = customerRepository;');

        // CRUD bodies
        expect(content).toContain('return customerRepository.findAll();');
        expect(content).toContain('return customerRepository.findById(id).orElseThrow');
        expect(content).toContain('return customerRepository.save(customer);');
        expect(content).toContain('customerRepository.deleteById(id);');

        // @Transactional on write operations
        expect(content).toContain('@Transactional');
        // findAll and findById should NOT have @Transactional
        const transactionalCount = (content.match(/@Transactional/g) ?? []).length;
        expect(transactionalCount).toBe(2); // save + deleteById
    });

    test('Service with mixed CRUD and custom operations', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it2b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Order {
                        total : String
                    }
                    interface OrderService {
                        findAll() : String [0..-1] {}
                        findById(id : Long) : String {}
                        save(order : Order) : Order {}
                        deleteById(id : Long) {}
                        calculateDiscount(order : Order) : String {
                            spec "Calculate discount based on order total"
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'OrderServiceImpl.java'), 'utf-8'
        );

        // CRUD bodies present
        expect(content).toContain('return orderRepository.findAll();');
        expect(content).toContain('return orderRepository.findById(id).orElseThrow');
        expect(content).toContain('return orderRepository.save(order);');
        expect(content).toContain('orderRepository.deleteById(id);');

        // Custom operation has spec comment and @Transactional
        expect(content).toContain('@prompt Calculate discount based on order total');
        expect(content).toContain('@generated NOT');
        expect(content).toContain('//generated start');
        expect(content).toContain('//generated end');

        // @Transactional on save, deleteById, and the spec-annotated operation
        const transactionalCount = (content.match(/@Transactional/g) ?? []).length;
        expect(transactionalCount).toBe(3);
    });

    test('Service with no matching entity types produces stubs only', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it2c-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    interface ReportService {
                        generate(name : String) {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'ReportServiceImpl.java'), 'utf-8'
        );

        // No repository injection
        expect(content).not.toContain('Repository');
        // Stub body
        expect(content).toContain('//generated start');
        expect(content).toContain('//generated end');
    });

    test('Service with multiple entity types injects multiple repositories', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it2d-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Customer { name : String }
                    class Order { total : String }
                    interface ReportService {
                        findById(id : Long) : String {}
                        save(customer : Customer) : Customer {}
                        saveOrder(order : Order) : Order {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'ReportServiceImpl.java'), 'utf-8'
        );

        // Both repositories injected
        expect(content).toContain('private final CustomerRepository customerRepository;');
        expect(content).toContain('private final OrderRepository orderRepository;');
        expect(content).toContain('import com.example.domain.Customer;');
        expect(content).toContain('import com.example.repository.CustomerRepository;');
        expect(content).toContain('import com.example.domain.Order;');
        expect(content).toContain('import com.example.repository.OrderRepository;');
    });
});

// ---------------------------------------------------------------------------
// Iteration 2.8 – E2E-Tests (alle Phase-2-Features kombiniert)
// ---------------------------------------------------------------------------
describe('Iteration 2.8 – E2E combined', () => {

    const MODEL = `
        package com {
            package example {
                primitive String
                primitive Long
                primitive Boolean

                abstract @joined class Vehicle {
                    brand : String
                    active : Boolean
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
                    seats : Long
                }

                @response datatype CarListResponse {
                    items : String [0..-1]
                }

                interface CarService {
                    findById(id : Long) : Long {}
                    deactivate(id : Long) {}
                }

                assoc VehicleAddress {
                    vehicle : Vehicle [0..-1]
                    address : Address
                }
            }
        }
    `;

    test('parses sample-phase2 model without errors', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
    });

    test('@joined abstract class produces @Entity + @Inheritance(JOINED)', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Vehicle.java'), 'utf8');
        expect(content).toContain('@Entity');
        expect(content).toContain('@Inheritance');
        expect(content).toContain('JOINED');
    });

    test('concrete Car class produces @Entity + repository', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'com', 'example', 'domain', 'Car.java'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'com', 'example', 'repository', 'CarRepository.java'))).toBe(true);
    });

    test('@mappedsuperclass produces @MappedSuperclass, no repository', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'AuditBase.java'), 'utf8');
        expect(content).toContain('@MappedSuperclass');
        expect(fs.existsSync(path.join(tmpDir, 'com', 'example', 'repository', 'AuditBaseRepository.java'))).toBe(false);
    });

    test('@ignore class produces no output file', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        expect(fs.existsSync(path.join(tmpDir, 'com', 'example', 'domain', 'InternalHelper.java'))).toBe(false);
    });

    test('@embeddable class produces @Embeddable, no repository', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Address.java'), 'utf8');
        expect(content).toContain('@Embeddable');
        expect(fs.existsSync(path.join(tmpDir, 'com', 'example', 'repository', 'AddressRepository.java'))).toBe(false);
    });

    test('@dto datatype produces Java record in dto/ subfolder', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const filePath = path.join(tmpDir, 'com', 'example', 'dto', 'CreateCarRequest.java');
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath, 'utf8')).toContain('public record CreateCarRequest');
    });

    test('@response datatype produces Java record in dto/ subfolder', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const filePath = path.join(tmpDir, 'com', 'example', 'dto', 'CarListResponse.java');
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath, 'utf8')).toContain('public record CarListResponse');
    });

    test('Interface with operations produces @Service impl', async () => {
        const doc = await parse(MODEL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const filePath = path.join(tmpDir, 'com', 'example', 'service', 'CarServiceImpl.java');
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain('@Service');
        expect(content).toContain('implements CarService');
    });

    test('Package-Konvention: datatype in dto-package produces record without @dto stereotype', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-e2e-'));
        const doc = await parse(`
            package com {
                package example {
                    package dto {
                        primitive String
                        datatype SearchRequest {
                            query : String
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const filePath = path.join(tmpDir, 'com', 'example', 'dto', 'dto', 'SearchRequest.java');
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath, 'utf8')).toContain('public record SearchRequest');
    });
});

// ---------------------------------------------------------------------------
// Iteration 3 – REST controller generator
// ---------------------------------------------------------------------------
describe('Iteration 3 – REST controller generator', () => {

    test('Interface-based controller generates @RestController with CRUD endpoints', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it3a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Customer { name : String }
                    @rest path="/customers"
                    interface CustomerService {
                        findAll() : String [0..-1] {}
                        findById(id : Long) : String {}
                        save(customer : Customer) : Customer {}
                        deleteById(id : Long) {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'CustomerServiceController.java'), 'utf-8'
        );

        expect(content).toContain('@RestController');
        expect(content).toContain('@RequestMapping("/customers")');
        expect(content).toContain('public class CustomerServiceController');
        expect(content).toContain('private final CustomerService customerService;');
        expect(content).toContain('@GetMapping');
        expect(content).toContain('@DeleteMapping("/{id}")');
        expect(content).toContain('ResponseEntity');
        expect(content).toContain('ResponseEntity.noContent().build()');
    });

    test('Class-based controller generates @RestController with repository injection', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it3b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Product { name : String }
                    @rest path="/products"
                    class ProductResource {
                        findAll() : String [0..-1] {}
                        findById(id : Long) : String {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'ProductResourceController.java'), 'utf-8'
        );

        expect(content).toContain('@RestController');
        expect(content).toContain('@RequestMapping("/products")');
        expect(content).toContain('private final ProductResourceRepository pProductResourceRepository;');
        expect(content).toContain('@GetMapping');
    });

    test('Controller with unmappable operation generates fallback mapping', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it3c-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Item { name : String }
                    @rest path="/items"
                    interface ItemService {
                        weirdOp() {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'ItemServiceController.java'), 'utf-8'
        );

        expect(content).toContain('@PostMapping');
        expect(content).toContain('ResponseEntity<Void>');
        expect(content).toContain('return ResponseEntity.noContent().build()');
    });

    test('Controller with no operations generates empty controller', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it3d-'));
        const doc = await parse(`
            package com {
                package example {
                    @rest path="/empty"
                    interface EmptyService { }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'EmptyServiceController.java'), 'utf-8'
        );

        expect(content).toContain('@RestController');
        expect(content).toContain('@RequestMapping("/empty")');
        expect(content).toContain('public class EmptyServiceController');
        // No methods
        expect(content).not.toContain('@GetMapping');
        expect(content).not.toContain('@PostMapping');
    });

    test('Controller imports DTO and Enumeration types from other sub-packages', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it3e-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    enum Status { ACTIVE, INACTIVE }
                    @dto
                    datatype CustomerRequest {
                        name : String
                    }
                    class Customer {
                        name : String
                    }
                    @rest path="/customers"
                    interface CustomerService {
                        getCustomer(id : String) : Customer {}
                        createCustomer(request : CustomerRequest) : Customer {}
                        getStatus() : Status {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'CustomerServiceController.java'), 'utf-8'
        );

        // Entity import
        expect(content).toContain('import com.example.domain.Customer;');
        // DTO import
        expect(content).toContain('import com.example.dto.CustomerRequest;');
        // Enumeration import
        expect(content).toContain('import com.example.domain.Status;');
    });
});

// ---------------------------------------------------------------------------
// Iteration 4 – Bean Validation annotations
// ---------------------------------------------------------------------------
describe('Iteration 4 – Bean Validation annotations', () => {

    test('Entity property with [1..1] gets @NotNull', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it4a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Customer {
                        name : String [1..1]
                        email : String [0..1]
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Customer.java'), 'utf-8'
        );
        expect(content).toContain('@NotNull');
        expect(content).toContain('import jakarta.validation.constraints.NotNull;');
        // email is optional, no @NotNull
        const notNullMatches = content.match(/@NotNull/g) ?? [];
        expect(notNullMatches.length).toBe(1);
    });

    test('DTO property with [1..1] gets @NotNull on record component', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it4b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    @dto datatype CreateReq {
                        name : String [1..1]
                        email : String [0..1]
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'dto', 'CreateReq.java'), 'utf-8'
        );
        expect(content).toContain('@NotNull String name');
        expect(content).not.toContain('@NotNull String email');
    });

    test('Embeddable property with [1..1] gets @NotNull', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it4c-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    datatype Address {
                        street : String [1..1]
                        city : String [0..1]
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'domain', 'Address.java'), 'utf-8'
        );
        expect(content).toContain('@NotNull');
        const notNullMatches = content.match(/@NotNull/g) ?? [];
        expect(notNullMatches.length).toBe(1);
    });

    test('Controller with @RequestBody gets @Valid', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it4d-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Customer { name : String }
                    @dto datatype CreateReq {
                        name : String [1..1]
                    }
                    @rest path="/customers"
                    interface CustomerService {
                        save(request : CreateReq) : Customer {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'CustomerServiceController.java'), 'utf-8'
        );
        expect(content).toContain('@RequestBody @Valid');
        expect(content).toContain('import jakarta.validation.Valid;');
    });
});

// ---------------------------------------------------------------------------
// Item 5 – OpenAPI/SpringDoc annotations
// ---------------------------------------------------------------------------
describe('Item 5 – OpenAPI/SpringDoc annotations', () => {

    test('Controller gets @Tag and @Operation with human-readable summary', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it5a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Customer { name : String }
                    @rest path="/customers"
                    interface CustomerService {
                        findAll() : String [0..-1] {}
                        findById(id : Long) : String {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'CustomerServiceController.java'), 'utf-8'
        );

        expect(content).toContain('@Tag(name = "/customers")');
        expect(content).toContain('@Operation(summary = "Find All")');
        expect(content).toContain('@Operation(summary = "Find By Id")');
        expect(content).toContain('import io.swagger.v3.oas.annotations.Operation;');
        expect(content).toContain('import io.swagger.v3.oas.annotations.tags.Tag;');
    });

    test('Controller with spec-annotated operation includes description', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it5b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    class Customer { name : String }
                    @rest path="/customers"
                    interface CustomerService {
                        findById(id : Long) : Customer {
                            spec "Find a customer by their unique identifier"
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'CustomerServiceController.java'), 'utf-8'
        );

        expect(content).toContain('@Operation(summary = "Find By Id", description = "Find a customer by their unique identifier")');
    });
});

// ---------------------------------------------------------------------------
// Item 6 – DTO/Entity mapping
// ---------------------------------------------------------------------------
describe('Item 6 – DTO/Entity mapping', () => {

    test('Service with DTO request and entity response generates mapping methods', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it6a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Customer {
                        name : String
                        email : String
                    }
                    @dto datatype CreateCustomerRequest {
                        name : String
                        email : String
                    }
                    @rest path="/customers"
                    interface CustomerService {
                        createCustomer(request : CreateCustomerRequest) : Customer {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'CustomerServiceImpl.java'), 'utf-8'
        );

        expect(content).toContain('private Customer toEntity(CreateCustomerRequest request)');
        expect(content).toContain('Customer customer = new Customer();');
        expect(content).toContain('customer.setName(request.name());');
        expect(content).toContain('customer.setEmail(request.email());');
        expect(content).toContain('return customer;');

        expect(content).toContain('private CreateCustomerRequest toDto(Customer customer)');
        expect(content).toContain('return new CreateCustomerRequest(');
        expect(content).toContain('customer.getName()');
        expect(content).toContain('import com.example.dto.CreateCustomerRequest;');
    });

    test('Service with no DTO/entity pairs generates no mapping methods', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it6b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive Long
                    primitive String
                    class Customer { name : String }
                    interface CustomerService {
                        findById(id : Long) : String {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'CustomerServiceImpl.java'), 'utf-8'
        );

        expect(content).not.toContain('toEntity');
        expect(content).not.toContain('toDto');
    });
});

// ---------------------------------------------------------------------------
// Item 7 – Spring Security scaffolding
// ---------------------------------------------------------------------------
describe('Item 7 – Spring Security scaffolding', () => {

    test('Controller method with preAuthorize gets @PreAuthorize', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it7a-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Customer { name : String }
                    @rest path="/customers"
                    interface CustomerService {
                        findAll() : String [0..-1] {
                            preAuthorize "hasRole('ADMIN')"
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'controller', 'CustomerServiceController.java'), 'utf-8'
        );
        expect(content).toContain("@PreAuthorize(hasRole('ADMIN'))");
        expect(content).toContain('import org.springframework.security.access.prepost.PreAuthorize;');
    });

    test('Service method with preAuthorize gets @PreAuthorize', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it7b-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Customer { name : String }
                    interface CustomerService {
                        findAll() : String [0..-1] {
                            preAuthorize "hasRole('ADMIN')"
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const content = fs.readFileSync(
            path.join(tmpDir, 'com', 'example', 'service', 'CustomerServiceImpl.java'), 'utf-8'
        );
        expect(content).toContain("@PreAuthorize(hasRole('ADMIN'))");
    });

    test('Model with preAuthorize generates SecurityConfig', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it7c-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Customer { name : String }
                    interface CustomerService {
                        findAll() : String [0..-1] {
                            preAuthorize "hasRole('ADMIN')"
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const configFile = path.join(tmpDir, 'com', 'config', 'SecurityConfig.java');
        expect(fs.existsSync(configFile)).toBe(true);
        const content = fs.readFileSync(configFile, 'utf-8');
        expect(content).toContain('@EnableWebSecurity');
        expect(content).toContain('@EnableMethodSecurity');
        expect(content).toContain('SecurityFilterChain');
    });

    test('Model without preAuthorize does not generate SecurityConfig', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-it7d-'));
        const doc = await parse(`
            package com {
                package example {
                    primitive String
                    class Customer { name : String }
                    interface CustomerService {
                        findAll() : String [0..-1] {}
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        generateSpringCode(doc.parseResult.value, 'model.cdiag', tmpDir);
        const configFile = path.join(tmpDir, 'com', 'config', 'SecurityConfig.java');
        expect(fs.existsSync(configFile)).toBe(false);
    });
});
