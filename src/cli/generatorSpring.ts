import {
    type Class,
    type DataType,
    type Enumeration,
    type Interface,
    type Association,
    type Model,
    type Operation,
    type Package,
    type PrimitiveType,
    type Property,
    type TypedElement,
} from '../language/generated/ast.js';
import { expandToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';
import { generateService } from './generatorService.js';
import { generateController } from './generatorController.js';

// ---------------------------------------------------------------------------
// Type mapping: model primitive names → Java types used in Spring/JPA code
// ---------------------------------------------------------------------------
const springTypeMap = new Map<string, string>([
    ['String',   'String'],
    ['Integer',  'Integer'],
    ['Boolean',  'Boolean'],
    ['Decimal',  'Double'],
    ['Long',     'Long'],
    ['Date',     'LocalDate'],
    ['DateTime', 'LocalDateTime'],
]);

// SQL-reserved words that must not be used as table names verbatim.
// JPA / Hibernate will quote these, but adding a suffix avoids portability issues.
const SQL_RESERVED = new Set([
    'order', 'group', 'user', 'table', 'column', 'index', 'select',
    'from', 'where', 'join', 'key', 'value', 'schema', 'catalog',
    'constraint', 'check', 'default', 'range', 'set',
]);

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Converts a CamelCase or PascalCase name to snake_case.
 * If the result is a SQL-reserved word, a trailing underscore is appended.
 * Examples:
 *   "CustomerOrder" → "customer_order"
 *   "Order"         → "order_"
 */
export function toSnakeCase(name: string): string {
    const snake = name
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase();
    return SQL_RESERVED.has(snake) ? snake + '_' : snake;
}

/**
 * Module-level override for the base Java package.
 * When set, replaces the DSL-derived package name in all generated output.
 */
let basePackageOverride: string | undefined;

export function setBasePackage(pkg: string | undefined): void {
    basePackageOverride = pkg;
}

export function getBasePackage(): string | undefined {
    return basePackageOverride;
}

/**
 * Returns the fully qualified package name using the given separator.
 * Mirrors `getQualifiedName` from generator.ts.
 * Used from iteration 1.2 onwards.
 */
export function getQualifiedName(pkg: Package, sep: string, forPath: boolean = false): string {
    if (basePackageOverride) {
        if (forPath) {
            return '';
        }
        return basePackageOverride.replace(/\./g, sep);
    }
    const names: string[] = [];
    let current: Package | undefined = pkg;
    while (current !== undefined) {
        names.push(current.name);
        if (current.$container.$type !== 'Model') {
            current = current.$container as Package;
        } else {
            current = undefined;
        }
    }
    return names.reverse().join(sep);
}

/**
 * Resolves the Java type string for a given TypedElement.
 * PrimitiveType names are mapped via springTypeMap; all other types use their
 * model name directly (Class, DataType, Enumeration, …).
 * Multiplicity > 1 or -1 (unbounded) yields List<T>.
 */
export function printSpringType(t: TypedElement | undefined): string {
    if (t === undefined) return '';
    let typeName: string;
    if (t.type?.ref?.$type === 'PrimitiveType') {
        typeName = springTypeMap.get(t.type.ref.name) ?? t.type.ref.name;
    } else {
        typeName = t.type?.ref?.name ?? '';
    }
    const isMultiple = t.upper !== undefined && t.upper !== 1;
    return isMultiple ? `List<${typeName}>` : typeName;
}

// ---------------------------------------------------------------------------
// Collect helpers (mirrors generator.ts)
// ---------------------------------------------------------------------------

function collectAllTypes(
    model: Model,
): Array<Class | DataType | PrimitiveType | Enumeration | Interface | Association> {
    const types: Array<Class | DataType | PrimitiveType | Enumeration | Interface | Association> = [];

    function collect(pkg: Package) {
        pkg.types.forEach(t => types.push(t));
        pkg.packages.forEach(sub => collect(sub));
    }

    model.packages.forEach(pkg => collect(pkg));
    return types;
}

export function collectAllAssociations(model: Model, clz: Class): Association[] {
    const assocs: Association[] = [];

    function collect(pkg: Package) {
        pkg.types.forEach(t => {
            if (t.$type === 'Association' &&
                (t as Association).properties?.some(p => p.type?.ref === clz)) {
                assocs.push(t as Association);
            }
        });
        pkg.packages.forEach(sub => collect(sub));
    }

    model.packages.forEach(pkg => collect(pkg));
    return assocs;
}

export function findRoot(type: Class | DataType | Enumeration): Model {
    let current: Package | undefined = type.$container as Package;
    while (current !== undefined) {
        if (current.$container.$type === 'Model') {
            return current.$container as unknown as Model;
        }
        current = current.$container as Package;
    }
    return {} as Model;
}

// ---------------------------------------------------------------------------
// Iteration 1.2 – Enum generator
// ---------------------------------------------------------------------------

/**
 * Generates a plain Java enum from a model Enumeration.
 * No JPA annotation required on the enum itself; entities reference it
 * via @Enumerated(EnumType.STRING).
 * Output: <dest>/<qualifiedPkg>/domain/<Name>.java
 */
export function generateJpaEnum(
    type: Enumeration,
    filePath: string,
    destination: string | undefined,
): string {
    const pkgPath = getQualifiedName(type.$container as Package, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}/${pkgPath}/domain`);
    const generatedFilePath = path.join(data.destination, `${type.name}.java`);

    const qualifiedPkg = getQualifiedName(type.$container as Package, '.');

    const fileNode = expandToNode`
        package ${qualifiedPkg}.domain;

        public enum ${type.name} {
            ${type.literals.join(', ')}
        }
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// Shared code-gen helpers (Getter / Setter)
// ---------------------------------------------------------------------------

function genGetter(p: Property): string {
    const capitalName = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    return `public ${printSpringType(p)} get${capitalName}() {
        return this.${p.name};
    }`;
}

function genSetter(p: Property): string {
    const capitalName = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    return `public void set${capitalName}(${printSpringType(p)} ${p.name}) {
        this.${p.name} = ${p.name};
    }`;
}

// ---------------------------------------------------------------------------
// Iteration 1.3 – Embeddable generator
// ---------------------------------------------------------------------------

/**
 * Generates a JPA @Embeddable class from a model DataType or a Class with
 * @embeddable stereotype.
 * Each property becomes a @Column-annotated field with getter/setter.
 * A no-arg constructor is emitted for JPA compatibility.
 * Output: <dest>/<qualifiedPkg>/domain/<Name>.java
 */
export function generateEmbeddable(
    type: DataType | Class,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = type.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}/${pkgPath}/domain`);
    const generatedFilePath = path.join(data.destination, `${type.name}.java`);

    const qualifiedPkg = getQualifiedName(pkg, '.');
    const props = (type.properties ?? []) as Property[];
    const hasMulti = props.some(p => p.upper !== undefined && p.upper !== 1);
    const hasNotNull = props.some(p => p.lower !== undefined && p.lower >= 1);

    const fields = props.map(p => {
        const notNull = p.lower !== undefined && p.lower >= 1 ? '\n    @NotNull' : '';
        return `@Column(name = "${toSnakeCase(p.name)}")${notNull}
    private ${printSpringType(p)} ${p.name};`;
    }).join('\n    ');

    const accessors = props.map(p =>
        `${genGetter(p)}\n    ${genSetter(p)}`,
    ).join('\n\n    ');

    const fileNode = expandToNode`
        package ${qualifiedPkg}.domain;

        import jakarta.persistence.Column;
        import jakarta.persistence.Embeddable;
        ${hasMulti ? 'import java.util.List;' : ''}
        ${hasNotNull ? 'import jakarta.validation.constraints.NotNull;' : ''}

        @Embeddable
        public class ${type.name} {

            ${fields}

            public ${type.name}() {}

            ${accessors}
        }
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// Iteration 1.5 – Association field helper
// ---------------------------------------------------------------------------

type AssocFieldInfo = {
    /** The property being generated as a field in clz */
    prop: Property;
    /** The JPA annotation lines (without leading @) */
    annotation: string;
    /** True when @JsonIgnore should be prepended */
    jsonIgnore: boolean;
    /** True when the field is a collection type (List<T>) */
    isMulti: boolean;
};

/**
 * Determines the JPA annotation and metadata for one side of a 2-property
 * association from the perspective of `clz`.
 *
 * thisProp  = property in the assoc that has type.ref === clz  (backref field)
 * otherProp = property in the assoc that has type.ref !== clz  (field in clz)
 */
function buildAssocFieldInfo(
    assocName: string,
    thisProp: Property,
    otherProp: Property,
): AssocFieldInfo {
    const isMultiOther = otherProp.upper !== undefined && otherProp.upper !== 1;
    const isMultiThis  = thisProp.upper  !== undefined && thisProp.upper  !== 1;
    const isComposite  = otherProp.kind === 'composite';

    let annotation: string;
    if (isMultiOther && !isMultiThis) {
        // One-to-Many: clz has a collection, the other end is the FK owner
        const extra = isComposite ? ', cascade = CascadeType.ALL, orphanRemoval = true' : '';
        annotation = `@OneToMany(mappedBy = "${thisProp.name}"${extra})`;
    } else if (isMultiOther && isMultiThis) {
        // Many-to-Many
        if (otherProp.notnavigable) {
            annotation = `@ManyToMany(mappedBy = "${thisProp.name}")`;
        } else {
            annotation = `@ManyToMany\n    @JoinTable(name = "${toSnakeCase(assocName)}")`;
        }
    } else if (!isMultiOther && isMultiThis) {
        // Many-to-One: the FK is owned here
        annotation = `@ManyToOne\n    @JoinColumn(name = "${toSnakeCase(otherProp.name)}_id")`;
    } else {
        // One-to-One
        if (otherProp.notnavigable) {
            annotation = `@OneToOne(mappedBy = "${thisProp.name}")`;
        } else {
            annotation = `@OneToOne\n    @JoinColumn(name = "${toSnakeCase(otherProp.name)}_id")`;
        }
    }

    return {
        prop: otherProp,
        annotation,
        jsonIgnore: otherProp.notnavigable,
        isMulti: isMultiOther,
    };
}

// ---------------------------------------------------------------------------
// Iteration 1.4 + 1.5 – Entity generator
// ---------------------------------------------------------------------------

/**
 * Generates a JPA @Entity (or @MappedSuperclass for abstract classes) from a
 * model Class.
 *
 * - Non-class properties → @Column / @Embedded / @Enumerated (iteration 1.4)
 * - Explicit associations (assoc blocks) → @OneToMany / @ManyToOne /
 *   @ManyToMany / @OneToOne with optional @JsonIgnore (iteration 1.5)
 * - Class-typed properties NOT covered by any explicit assoc →
 *   implicit @ManyToOne with warning comment (iteration 1.5)
 *
 * Auto-generates an `id: Long` field with @Id + @GeneratedValue when neither
 * the class itself nor its direct superclass already defines an `id` property.
 *
 * Output: <dest>/<qualifiedPkg>/domain/<Name>.java
 */
export function generateJpaEntity(
    clz: Class,
    model: Model,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = clz.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}/${pkgPath}/domain`);
    const generatedFilePath = path.join(data.destination, `${clz.name}.java`);
    const qualifiedPkg = getQualifiedName(pkg, '.');

    // Non-class own properties (iteration 1.4 – unchanged)
    const ownProps = (clz.properties as Property[]).filter(
        p => p.type?.ref?.$type !== 'Class',
    );

    // ---------- Iteration 1.5: explicit associations -------------------------
    const explicitAssocs = collectAllAssociations(model, clz);

    const assocFields: AssocFieldInfo[] = explicitAssocs.flatMap(assoc => {
        const assocProps = assoc.properties as Property[];
        const thisProp  = assocProps.find(p => p.type.ref === clz);
        const otherProp = assocProps.find(p => p.type.ref !== clz);
        if (!thisProp || !otherProp) return [];
        return [buildAssocFieldInfo(assoc.name, thisProp, otherProp)];
    });

    // Implicit Class-typed properties not covered by any explicit assoc
    const explicitFieldNames = new Set(assocFields.map(f => f.prop.name));
    const implicitClassProps = (clz.properties as Property[]).filter(
        p => p.type?.ref?.$type === 'Class' && !explicitFieldNames.has(p.name),
    );

    // ---------- id auto-generation -------------------------------------------
    const hasOwnId = (clz.properties as Property[]).some(p => p.name === 'id');
    const hasSuperclassId = (clz.superClasses ?? []).some(
        sc => ((sc.ref?.properties ?? []) as Property[]).some(p => p.name === 'id'),
    );
    const needsAutoId = !hasOwnId && !hasSuperclassId;

    // ---------- Import flags --------------------------------------------------
    const hasMultiOwn   = ownProps.some(p => p.upper !== undefined && p.upper !== 1);
    const hasMultiAssoc = assocFields.some(f => f.isMulti);
    const hasMulti      = hasMultiOwn || hasMultiAssoc;
    const hasDateTypes  = ownProps.some(p =>
        ['LocalDate', 'LocalDateTime'].includes(springTypeMap.get(p.type?.ref?.name ?? '') ?? ''),
    );
    const hasJsonIgnore = assocFields.some(f => f.jsonIgnore);
    const hasNotNull = ownProps.some(p => p.lower !== undefined && p.lower >= 1);

    // ---------- Structural strings -------------------------------------------
    const superClass     = clz.superClasses?.[0]?.ref;
    const extendsClause  = superClass ? ` extends ${superClass.name}` : '';
    const st = getStereotype(clz);
    const isMappedSuperclass = clz.abstract || st === 'mappedsuperclass';

    let classAnnotation: string;
    let needsInheritanceImport = false;
    if (clz.abstract && st === 'entity') {
        classAnnotation = `@Entity\n@Inheritance(strategy = InheritanceType.SINGLE_TABLE)\n@Table(name = "${toSnakeCase(clz.name)}")`;
        needsInheritanceImport = true;
    } else if (clz.abstract && st === 'joined') {
        classAnnotation = `@Entity\n@Inheritance(strategy = InheritanceType.JOINED)\n@Table(name = "${toSnakeCase(clz.name)}")`;
        needsInheritanceImport = true;
    } else if (isMappedSuperclass) {
        classAnnotation = '@MappedSuperclass';
    } else {
        classAnnotation = `@Entity\n@Table(name = "${toSnakeCase(clz.name)}")`;
    }

    // ---- Build field declarations ------------------------------------------
    const idBlock = needsAutoId
        ? '    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    private Long id;'
        : '';

    const propFields = ownProps.map(p => {
        const notNull = p.lower !== undefined && p.lower >= 1 ? '    @NotNull\n' : '';
        if (p.name === 'id') {
            return '    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    private Long id;';
        }
        switch (p.type?.ref?.$type) {
            case 'DataType':
                return `${notNull}    @Embedded\n    private ${printSpringType(p)} ${p.name};`;
            case 'Enumeration':
                return `${notNull}    @Enumerated(EnumType.STRING)\n    @Column(name = "${toSnakeCase(p.name)}")\n    private ${printSpringType(p)} ${p.name};`;
            default: // PrimitiveType
                return `${notNull}    @Column(name = "${toSnakeCase(p.name)}")\n    private ${printSpringType(p)} ${p.name};`;
        }
    });

    const assocFieldLines = assocFields.map(f => {
        const jsonIgnoreLine = f.jsonIgnore ? '    @JsonIgnore\n' : '';
        const typeName = f.prop.type.ref?.name ?? '';
        const fieldType = f.isMulti ? `List<${typeName}>` : typeName;
        return `${jsonIgnoreLine}    ${f.annotation}\n    private ${fieldType} ${f.prop.name};`;
    });

    const implicitFieldLines = implicitClassProps.map(p => {
        const typeName = p.type.ref?.name ?? '';
        const fieldType = (p.upper !== undefined && p.upper !== 1)
            ? `List<${typeName}>` : typeName;
        return `    // WARN: implicit @ManyToOne (no explicit assoc declared)\n    @ManyToOne\n    @JoinColumn(name = "${toSnakeCase(p.name)}_id")\n    private ${fieldType} ${p.name};`;
    });

    // ---- Build accessor declarations ----------------------------------------
    const autoIdAccessors = needsAutoId ? [
        '    public Long getId() {',
        '        return this.id;',
        '    }',
        '',
        '    public void setId(Long id) {',
        '        this.id = id;',
        '    }',
    ].join('\n') : '';

    const propAccessors    = ownProps.map(p => `    ${genGetter(p)}\n\n    ${genSetter(p)}`);
    const assocAccessors   = assocFields.map(f => `    ${genGetter(f.prop)}\n\n    ${genSetter(f.prop)}`);
    const implicitAccessors = implicitClassProps.map(p => `    ${genGetter(p)}\n\n    ${genSetter(p)}`);

    // ---- Assemble the file --------------------------------------------------
    const lines: string[] = [];
    lines.push(`package ${qualifiedPkg}.domain;`);
    lines.push('');
    lines.push('import jakarta.persistence.*;');
    if (needsInheritanceImport) {
        lines.push('import jakarta.persistence.Inheritance;');
        lines.push('import jakarta.persistence.InheritanceType;');
    }
    if (hasMulti)      lines.push('import java.util.List;');
    if (hasDateTypes) {
        lines.push('import java.time.LocalDate;');
        lines.push('import java.time.LocalDateTime;');
    }
    if (hasJsonIgnore) lines.push('import com.fasterxml.jackson.annotation.JsonIgnore;');
    if (hasNotNull) lines.push('import jakarta.validation.constraints.NotNull;');
    lines.push('');
    lines.push(classAnnotation);
    lines.push(`public ${clz.abstract ? 'abstract ' : ''}class ${clz.name}${extendsClause} {`);
    lines.push('');
    if (idBlock)                    { lines.push(idBlock);                                     lines.push(''); }
    if (propFields.length > 0)      { lines.push(propFields.join('\n\n'));                      lines.push(''); }
    if (assocFieldLines.length > 0) { lines.push(assocFieldLines.join('\n\n'));                 lines.push(''); }
    if (implicitFieldLines.length > 0) { lines.push(implicitFieldLines.join('\n\n'));           lines.push(''); }
    if (autoIdAccessors)            { lines.push(autoIdAccessors);                              lines.push(''); }
    if (propAccessors.length > 0)   { lines.push(propAccessors.join('\n\n'));                   lines.push(''); }
    if (assocAccessors.length > 0)  { lines.push(assocAccessors.join('\n\n'));                  lines.push(''); }
    if (implicitAccessors.length > 0) { lines.push(implicitAccessors.join('\n\n'));             lines.push(''); }
    lines.push('}');
    lines.push('');

    const content = lines.join('\n');
    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, content);
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// Iteration 1.6 – Repository generator
// ---------------------------------------------------------------------------

/**
 * Generates a Spring Data JPA repository interface for a concrete (non-abstract) entity.
 * Output: <dest>/<qualifiedPkg>/repository/<Name>Repository.java
 *
 * The interface extends JpaRepository<<Name>, Long> and is intentionally left
 * empty so that custom query methods can be added by the developer.
 */
export function generateSpringRepository(
    clz: Class,
    filePath: string,
    destination: string | undefined,
): string {
    const pkgPath = getQualifiedName(clz.$container as Package, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}/${pkgPath}/repository`);
    const generatedFilePath = path.join(data.destination, `${clz.name}Repository.java`);

    const qualifiedPkg = getQualifiedName(clz.$container as Package, '.');

    const fileNode = expandToNode`
        package ${qualifiedPkg}.repository;

        import org.springframework.data.jpa.repository.JpaRepository;
        import ${qualifiedPkg}.domain.${clz.name};

        public interface ${clz.name}Repository extends JpaRepository<${clz.name}, Long> {
        }
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// Phase 2 helpers
// ---------------------------------------------------------------------------

/**
 * Returns the stereotype string of a Class, DataType, or Interface node,
 * stripping the leading '@'.
 * Examples: '@entity' → 'entity', undefined → undefined
 */
export function getStereotype(
    node: Class | DataType | Interface,
): string | undefined {
    const s = (node as { stereotype?: string }).stereotype;
    return s ? s.slice(1) : undefined;
}

// ---------------------------------------------------------------------------
// Iteration 2.5 – DTO generator
// ---------------------------------------------------------------------------

/**
 * Returns true when a DataType or Class should be generated as a DTO record:
 * - Explicit stereotype @dto, @request, or @response
 * - Or DataType in a package named 'dto', 'request', or 'response' (convention)
 */
export function isDtoType(type: DataType | Class): boolean {
    const st = getStereotype(type);
    if (st === 'dto' || st === 'request' || st === 'response') return true;
    const pkg = type.$container as Package;
    return ['dto', 'request', 'response'].includes(pkg.name.toLowerCase());
}

/**
 * Generates a Java record DTO from a model DataType or DTO-annotated Class.
 * No JPA imports. Properties become record components.
 * Output: <dest>/<qualifiedPkg>/dto/<Name>.java
 */
export function generateDto(
    type: DataType | Class,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = type.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}/${pkgPath}/dto`);
    const generatedFilePath = path.join(data.destination, `${type.name}.java`);
    const qualifiedPkg = getQualifiedName(pkg, '.');

    const props = (type.properties ?? []) as Property[];
    const hasMulti = props.some(p => p.upper !== undefined && p.upper !== 1);
    const hasDate  = props.some(p => {
        const mapped = springTypeMap.get(p.type?.ref?.name ?? '');
        return mapped === 'LocalDate' || mapped === 'LocalDateTime';
    });
    const hasNotNull = props.some(p => p.lower !== undefined && p.lower >= 1);

    const params = props.map(p => {
        const notNull = p.lower !== undefined && p.lower >= 1 ? '@NotNull ' : '';
        return `${notNull}${printSpringType(p)} ${p.name}`;
    }).join(', ');

    const lines: string[] = [];
    lines.push(`package ${qualifiedPkg}.dto;`);
    lines.push('');
    if (hasMulti)  lines.push('import java.util.List;');
    if (hasDate) {
        lines.push('import java.time.LocalDate;');
        lines.push('import java.time.LocalDateTime;');
    }
    if (hasNotNull) lines.push('import jakarta.validation.constraints.NotNull;');
    if (hasMulti || hasDate || hasNotNull) lines.push('');
    lines.push(`public record ${type.name}(${params}) {}`);
    lines.push('');

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, lines.join('\n'));
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// Iteration 2.6 – Service generator
// ---------------------------------------------------------------------------

/**
 * Generates a Spring @Service implementation class for a model Interface.
 * For each operation a @Override stub method is created.
 * Output: <dest>/<qualifiedPkg>/service/<Name>Impl.java
 */
export function generateServiceImpl(
    iface: Interface,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = iface.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}/${pkgPath}/service`);
    const generatedFilePath = path.join(data.destination, `${iface.name}Impl.java`);
    const qualifiedPkg = getQualifiedName(pkg, '.');

    const operations = (iface.operations ?? []) as Operation[];

    const methods = operations.map(op => {
        const returnType = op.type?.ref ? printSpringType(op) : 'void';
        const params = (op.params ?? []).map(p => `${printSpringType(p)} ${p.name}`).join(', ');
        const javadoc = op.description
            ? `    /**\n     * @prompt ${op.description.replace(/\n/g, '\n     * ')}\n     */\n`
            : '';
        return [
            `${javadoc}    @Override`,
            `    public ${returnType} ${op.name}(${params}) {`,
            `        throw new UnsupportedOperationException("Not yet implemented");`,
            '    }',
        ].join('\n');
    });

    const lines: string[] = [];
    lines.push(`package ${qualifiedPkg}.service;`);
    lines.push('');
    lines.push('import org.springframework.stereotype.Service;');
    lines.push(`import ${qualifiedPkg}.${iface.name};`);
    lines.push('');
    lines.push('@Service');
    lines.push(`public class ${iface.name}Impl implements ${iface.name} {`);
    lines.push('');
    if (methods.length > 0) {
        lines.push(methods.join('\n\n'));
        lines.push('');
    }
    lines.push('}');
    lines.push('');

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, lines.join('\n'));
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// SecurityConfig generator
// ---------------------------------------------------------------------------

export function generateSecurityConfig(
    model: Model,
    filePath: string,
    destination: string | undefined,
): string {
    const rootPkg = model.packages[0];
    if (!rootPkg) return '';
    const qualifiedPkg = getQualifiedName(rootPkg, '.');
    const data = extractDestinationAndName(filePath, `${destination}/${qualifiedPkg.replace(/\./g, '/')}/config`);
    const generatedFilePath = path.join(data.destination, 'SecurityConfig.java');

    const fileNode = expandToNode`
        package ${qualifiedPkg}.config;

        import org.springframework.context.annotation.Bean;
        import org.springframework.context.annotation.Configuration;
        import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
        import org.springframework.security.config.annotation.web.builders.HttpSecurity;
        import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
        import org.springframework.security.web.SecurityFilterChain;

        @Configuration
        @EnableWebSecurity
        @EnableMethodSecurity
        public class SecurityConfig {

            @Bean
            public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
                http
                    .authorizeHttpRequests(auth -> auth
                        .anyRequest().authenticated()
                    )
                    .csrf(csrf -> csrf.disable());
                return http.build();
            }
        }
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Main entry point for the Spring/JPA code generator.
 */
export function generateSpringCode(
    model: Model,
    filePath: string,
    destination: string | undefined,
    basePackage?: string,
): string {
    setBasePackage(basePackage);
    const allTypes = collectAllTypes(model);

    allTypes.forEach(type => {
        if (type.$type === 'Class') {
            const st = getStereotype(type);
            if (st === 'ignore') return;
            if (st === 'embeddable') {
                generateEmbeddable(type, filePath, destination);
                return; // no repository for embeddables
            }
            if (isDtoType(type)) {
                generateDto(type, filePath, destination);
                return; // no repository for DTOs
            }
            generateJpaEntity(type, model, filePath, destination);
            // @entity / @joined abstract classes are real entities → get a repository
            const isInheritanceRoot = type.abstract && (st === 'entity' || st === 'joined');
            const noRepository = (type.abstract && !isInheritanceRoot) || st === 'mappedsuperclass';
            if (!noRepository) {
                generateSpringRepository(type, filePath, destination);
            }
        } else if (type.$type === 'DataType') {
            const st = getStereotype(type);
            if (st === 'ignore') return;
            if (isDtoType(type)) {
                generateDto(type, filePath, destination);
            } else {
                generateEmbeddable(type, filePath, destination);
            }
        } else if (type.$type === 'Enumeration') {
            generateJpaEnum(type, filePath, destination);
        }
        // PrimitiveType, Association: no separate file generated
        // Interface: generate @Service impl when it has operations
        if (type.$type === 'Interface') {
            const iface = type as Interface;
            if ((iface.operations ?? []).length > 0) {
                generateService(iface, filePath, destination);
            }
        }
        // @rest-annotated types: generate REST controllers
        if ((type as any).restAnnotation) {
            if (type.$type === 'Interface' || type.$type === 'Class') {
                generateController(type as Interface | Class, model, filePath, destination);
            }
        }
    });

    // Generate SecurityConfig if any operation has preAuthorize
    const hasSecurity = allTypes.some(t => {
        if (t.$type === 'Interface' || t.$type === 'Class') {
            const ops = (t as any).operations ?? [];
            return ops.some((o: any) => o.preAuthorize);
        }
        return false;
    });
    if (hasSecurity) {
        generateSecurityConfig(model, filePath, destination);
    }

    return destination ?? '';
}
