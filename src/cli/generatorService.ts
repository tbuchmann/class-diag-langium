import {
    type Class,
    type DataType,
    type Interface,
    type Model,
    type Operation,
    type Package,
    type TypedElement,
} from '../language/generated/ast.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';
import { collectTypeImports, getQualifiedName, printSpringType } from './generatorSpring.js';

/**
 * Collects all Class (entity) types referenced across an interface's operations.
 * Scans both parameter types and return types.
 */
function collectReferencedEntities(iface: Interface): string[] {
    const entityNames = new Set<string>();
    for (const op of iface.operations ?? []) {
        const opNode = op as Operation;
        if (opNode.type?.ref?.$type === 'Class') {
            entityNames.add(opNode.type.ref.name);
        }
        for (const param of opNode.params ?? []) {
            if (param.type?.ref?.$type === 'Class') {
                entityNames.add(param.type.ref.name);
            }
        }
    }
    return Array.from(entityNames).sort();
}

/**
 * Finds the root Model from a Package by walking up the containment chain.
 */
function findRootModel(pkg: Package): Model | undefined {
    let current: Package | undefined = pkg;
    while (current !== undefined) {
        if (current.$container.$type === 'Model') {
            return current.$container as unknown as Model;
        }
        current = current.$container as Package | undefined;
    }
    return undefined;
}

/**
 * Collects all Class types in the model (all packages).
 */
function collectAllClasses(model: Model | undefined): Class[] {
    if (!model) return [];
    const result: Class[] = [];
    function collect(pkg: Package) {
        for (const t of pkg.types) {
            if (t.$type === 'Class') {
                result.push(t as Class);
            }
        }
        for (const sub of pkg.packages) {
            collect(sub);
        }
    }
    model.packages.forEach(collect);
    return result;
}

/**
 * Collects all DataType types in the model (all packages).
 */
function collectAllDataTypes(model: Model | undefined): DataType[] {
    if (!model) return [];
    const result: DataType[] = [];
    function collect(pkg: Package) {
        for (const t of pkg.types) {
            if (t.$type === 'DataType') {
                result.push(t as DataType);
            }
        }
        for (const sub of pkg.packages) {
            collect(sub);
        }
    }
    model.packages.forEach(collect);
    return result;
}

/**
 * Strips common suffixes from a DTO name to get a base name for matching.
 */
function stripDtoSuffix(name: string): string {
    return name
        .replace(/(Snapshot|Request|Response|Dto|DTO|Result)$/, '');
}

/**
 * Computes the property name overlap between a DTO and a Class.
 * Returns the number of matching property names.
 */
function countMatchingProperties(dto: DataType | Class, entity: Class): number {
    const dtoProps = new Set((dto.properties ?? []).map((p: TypedElement) => p.name));
    const entityProps = new Set((entity.properties ?? []).map((p: TypedElement) => p.name));
    let count = 0;
    for (const prop of dtoProps) {
        if (entityProps.has(prop)) count++;
    }
    return count;
}

/**
 * Infers which entity types correspond to the DTOs used in an interface's operations.
 * Uses both name-based and property-based matching.
 * Returns entity names that are not already in `alreadyReferenced`.
 */
function inferEntitiesFromDTOs(
    iface: Interface,
    alreadyReferenced: Set<string>,
): string[] {
    const model = findRootModel(iface.$container as Package);
    const allClasses = collectAllClasses(model);
    const allDTOs = collectAllDataTypes(model);

    // Collect all DTOs used in operations
    const usedDtoNames = new Set<string>();
    for (const op of iface.operations ?? []) {
        const opNode = op as Operation;
        const returnType = opNode.type?.ref;
        if (returnType?.$type === 'DataType') {
            usedDtoNames.add(returnType.name);
        }
        for (const param of opNode.params ?? []) {
            if (param.type?.ref?.$type === 'DataType') {
                usedDtoNames.add(param.type.ref.name);
            }
        }
    }

    const inferred = new Set<string>();

    for (const dtoName of usedDtoNames) {
        if (alreadyReferenced.has(dtoName) || inferred.has(dtoName)) continue;

        const dto = allDTOs.find(d => d.name === dtoName);
        if (!dto) continue;

        // Try name-based matching first
        const baseName = stripDtoSuffix(dtoName);
        const nameMatch = allClasses.find(c =>
            !alreadyReferenced.has(c.name) && !inferred.has(c.name) &&
            (c.name.toLowerCase().includes(baseName.toLowerCase()) ||
                baseName.toLowerCase().includes(c.name.toLowerCase().replace(/entity$/i, '')))
        );

        if (nameMatch) {
            inferred.add(nameMatch.name);
            continue;
        }

        // Fall back to property-based matching
        let bestMatch: Class | undefined;
        let bestScore = 0;
        for (const cls of allClasses) {
            if (alreadyReferenced.has(cls.name) || inferred.has(cls.name)) continue;
            const score = countMatchingProperties(dto, cls);
            // Require at least 2 matching properties to avoid false positives
            if (score > bestScore && score >= 2) {
                bestScore = score;
                bestMatch = cls;
            }
        }
        if (bestMatch) {
            inferred.add(bestMatch.name);
        }
    }

    return Array.from(inferred).sort();
}

/**
 * Finds the entity type referenced by an operation's parameters or return type.
 * Returns the first matching entity name, or undefined.
 */
function findEntityForOperation(op: Operation, entities: string[]): string | undefined {
    const opNode = op as Operation;
    // Check parameter types first
    for (const param of opNode.params ?? []) {
        if (param.type?.ref?.$type === 'Class' && entities.includes(param.type.ref.name)) {
            return param.type.ref.name;
        }
    }
    // Check return type
    if (opNode.type?.ref?.$type === 'Class' && entities.includes(opNode.type.ref.name)) {
        return opNode.type.ref.name;
    }
    return undefined;
}

/**
 * Determines if an operation matches a known CRUD pattern and returns
 * the generated method body, or undefined if no pattern matches.
 */
function getCrudBody(
    op: Operation,
    entityName: string,
    repoName: string,
): string | undefined {
    const params = op.params ?? [];
    const hasReturnType = op.type?.ref !== undefined;
    const returnTypeIsCollection = op.upper !== undefined && op.upper !== 1;
    const firstParamType = params[0]?.type?.ref?.name;
    const firstParamIsEntity = params[0]?.type?.ref?.$type === 'Class';

    // findAll() — no params, returns collection
    if (params.length === 0 && hasReturnType && returnTypeIsCollection) {
        return `        return ${repoName}.findAll();`;
    }

    // save(entity) — single entity param, returns entity
    if (params.length === 1 && firstParamIsEntity && hasReturnType) {
        return `        return ${repoName}.save(${params[0].name});`;
    }

    // findById(id) — single ID param, returns single entity
    if (
        params.length === 1 &&
        firstParamType !== undefined &&
        hasReturnType &&
        !returnTypeIsCollection
    ) {
        return `        return ${repoName}.findById(${params[0].name}).orElseThrow(() -> new RuntimeException("${entityName} not found"));`;
    }

    // deleteById(id) — single ID param, void return
    if (params.length === 1 && firstParamType !== undefined && !hasReturnType) {
        return `        ${repoName}.deleteById(${params[0].name});`;
    }

    return undefined;
}

/**
 * Determines if an operation is a write operation (needs @Transactional).
 */
function isWriteOperation(op: Operation): boolean {
    const params = op.params ?? [];
    const hasReturnType = op.type?.ref !== undefined;
    const firstParamIsEntity = params[0]?.type?.ref?.$type === 'Class';

    // save(entity) — single entity param
    if (params.length === 1 && firstParamIsEntity && hasReturnType) return true;

    // deleteById(id) — single ID param, void return
    if (params.length === 1 && !hasReturnType) return true;

    return false;
}

type MappingPair = {
    dtoName: string;
    entityName: string;
    dtoProps: string[];
    entityProps: string[];
};

function collectMappingPairs(iface: Interface): MappingPair[] {
    const pairs: MappingPair[] = [];
    const seen = new Set<string>();

    for (const op of iface.operations ?? []) {
        const opNode = op as Operation;
        const params = opNode.params ?? [];
        const returnType = opNode.type?.ref;

        for (const param of params) {
            const paramType = param.type?.ref;
            if (!paramType) continue;
            const isDto = paramType.$type === 'DataType' || (paramType as any).stereotype?.startsWith('@dto');
            if (!isDto) continue;

            const dtoName = paramType.name;
            const baseName = dtoName
                .replace(/Request$/, '')
                .replace(/Response$/, '')
                .replace(/DTO$/, '')
                .replace(/Dto$/, '')
                .replace(/^(Create|Update|Get|Delete|Find)/, '');

            if (returnType?.$type === 'Class' && (returnType.name === baseName || returnType.name === dtoName)) {
                const key = `${dtoName}->${returnType.name}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    pairs.push({
                        dtoName,
                        entityName: returnType.name,
                        dtoProps: (paramType as any).properties?.map((p: any) => p.name) ?? [],
                        entityProps: (returnType as any).properties?.map((p: any) => p.name) ?? [],
                    });
                }
            }
        }
    }

    return pairs;
}

function generateToEntityMethod(pair: MappingPair): string {
    const lines: string[] = [];
    const entityVar = toCamel(pair.entityName);
    lines.push(`    private ${pair.entityName} toEntity(${pair.dtoName} request) {`);
    lines.push(`        ${pair.entityName} ${entityVar} = new ${pair.entityName}();`);

    for (const dtoProp of pair.dtoProps) {
        const matchingEntityProp = pair.entityProps.find(ep => ep === dtoProp);
        if (matchingEntityProp) {
            const capName = matchingEntityProp.charAt(0).toUpperCase() + matchingEntityProp.slice(1);
            lines.push(`        ${entityVar}.set${capName}(request.${dtoProp}());`);
        } else {
            lines.push(`        // TODO: map ${dtoProp} (no matching entity property)`);
        }
    }

    for (const entityProp of pair.entityProps) {
        if (!pair.dtoProps.includes(entityProp)) {
            lines.push(`        // TODO: map ${entityProp} (no matching DTO property)`);
        }
    }

    lines.push(`        return ${entityVar};`);
    lines.push('    }');
    return lines.join('\n');
}

function generateToDtoMethod(pair: MappingPair): string {
    const lines: string[] = [];
    const entityVar = toCamel(pair.entityName);
    lines.push(`    private ${pair.dtoName} toDto(${pair.entityName} ${entityVar}) {`);
    lines.push(`        return new ${pair.dtoName}(`);

    const args = pair.dtoProps.map((prop, i) => {
        const matchingEntityProp = pair.entityProps.find(ep => ep === prop);
        if (matchingEntityProp) {
            const getter = `${entityVar}.get${prop.charAt(0).toUpperCase() + prop.slice(1)}()`;
            return `            ${getter}${i < pair.dtoProps.length - 1 ? ',' : ''}`;
        } else {
            return `            // TODO: map ${prop}${i < pair.dtoProps.length - 1 ? ',' : ''}`;
        }
    });

    lines.push(args.join('\n'));
    lines.push('        );');
    lines.push('    }');
    return lines.join('\n');
}

/**
 * Generates a Spring @Service implementation class for a model Interface.
 *
 * Features:
 * - Constructor injection of repositories based on entity types in operations
 * - CRUD method bodies for findAll, findById, save, deleteById
 * - @Transactional on write operations and spec-annotated operations
 * - @prompt Javadoc comments from operation spec descriptions
 */
export function generateService(
    iface: Interface,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = iface.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}${pkgPath ? '/' + pkgPath : ''}/service`);
    const generatedFilePath = path.join(data.destination, `${iface.name}Impl.java`);
    const qualifiedPkg = getQualifiedName(pkg, '.');

    const operations = (iface.operations ?? []) as Operation[];
    const directEntities = collectReferencedEntities(iface);
    const inferredEntities = inferEntitiesFromDTOs(iface, new Set(directEntities));
    const entities = [...directEntities, ...inferredEntities];
    const mappingPairs = collectMappingPairs(iface);

    // Build repository field declarations and constructor params
    const repoFields = entities.map(e =>
        `    private final ${e}Repository ${toCamel(e)}Repository;`
    ).join('\n');

    const constructorParams = entities.map(e =>
        `${e}Repository ${toCamel(e)}Repository`
    ).join(', ');

    const constructorAssignments = entities.map(e =>
        `        this.${toCamel(e)}Repository = ${toCamel(e)}Repository;`
    ).join('\n');

    const hasTransactional = operations.some(op =>
        isWriteOperation(op) || op.description !== undefined
    );

    const methods = operations.map(op => {
        const returnType = op.type?.ref ? printSpringType(op) : 'void';
        const params = (op.params ?? []).map(p => `${printSpringType(p)} ${p.name}`).join(', ');
        const javadoc = op.description
            ? `    /**\n     * @prompt ${op.description.replace(/\n/g, '\n     * ')}\n     * @generated NOT\n     */\n`
            : '';

        // Try CRUD body first — find the matching entity for this operation
        let body: string;
        const opEntity = findEntityForOperation(op, entities);
        const entityName = opEntity ?? entities[0] ?? '';
        const repoName = entityName ? `${toCamel(entityName)}Repository` : '';
        // Operations with a spec description always get a stub body
        const crudBody = !op.description && entityName ? getCrudBody(op, entityName, repoName) : undefined;

        if (crudBody) {
            body = ` {\n${crudBody}\n    }`;
        } else {
            body = ` {
        //generated start
        throw new UnsupportedOperationException("Not yet implemented");
        //generated end
    }`;
        }

        const transactional = (isWriteOperation(op) || op.description !== undefined)
            ? '\n    @Transactional'
            : '';
        const preAuthorize = (op as any).preAuthorize
            ? `\n    @PreAuthorize(${(op as any).preAuthorize})`
            : '';

        return [
            `${javadoc}    @Override${transactional}${preAuthorize}`,
            `    public ${returnType} ${op.name}(${params})${body}`,
        ].join('\n');
    });

    const hasPreAuthorize = operations.some(op => (op as any).preAuthorize);

    const hasList = operations.some(op =>
        (op.type?.ref && printSpringType(op).startsWith('List<')) ||
        (op.params ?? []).some(p => printSpringType(p).startsWith('List<'))
    );

    const lines: string[] = [];
    lines.push(`package ${qualifiedPkg}.service;`);
    lines.push('');
    lines.push('import org.springframework.stereotype.Service;');
    if (hasTransactional) {
        lines.push('import org.springframework.transaction.annotation.Transactional;');
    }
    if (hasPreAuthorize) {
        lines.push('import org.springframework.security.access.prepost.PreAuthorize;');
    }
    if (hasList) {
        lines.push('import java.util.List;');
    }
    lines.push(`import ${qualifiedPkg}.${iface.name};`);
    for (const e of entities) {
        lines.push(`import ${qualifiedPkg}.domain.${e};`);
        lines.push(`import ${qualifiedPkg}.repository.${e}Repository;`);
    }
    for (const pair of mappingPairs) {
        lines.push(`import ${qualifiedPkg}.dto.${pair.dtoName};`);
    }
    // Collect all typed elements (return types + params) for import resolution
    const allTypedElements: TypedElement[] = [];
    for (const op of operations) {
        allTypedElements.push(op);
        for (const p of op.params ?? []) {
            allTypedElements.push(p);
        }
    }
    const typeImports = collectTypeImports(allTypedElements, pkg, 'service');
    for (const imp of typeImports) {
        lines.push(imp);
    }
    lines.push('');
    lines.push('@Service');
    lines.push(`public class ${iface.name}Impl implements ${iface.name} {`);
    lines.push('');
    if (repoFields) {
        lines.push(repoFields);
        lines.push('');
        lines.push(`    public ${iface.name}Impl(${constructorParams}) {`);
        lines.push(constructorAssignments);
        lines.push('    }');
        lines.push('');
    }
    if (methods.length > 0) {
        lines.push(methods.join('\n\n'));
        lines.push('');
    }
    if (mappingPairs.length > 0) {
        for (const pair of mappingPairs) {
            lines.push(generateToEntityMethod(pair));
            lines.push('');
            lines.push(generateToDtoMethod(pair));
            lines.push('');
        }
    }
    lines.push('}');
    lines.push('');

    // Generate the service interface file
    generateServiceInterface(iface, filePath, destination);

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, lines.join('\n'));
    return generatedFilePath;
}

function generateServiceInterface(
    iface: Interface,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = iface.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}${pkgPath ? '/' + pkgPath : ''}`);
    const generatedFilePath = path.join(data.destination, `${iface.name}.java`);
    const qualifiedPkg = getQualifiedName(pkg, '.');

    const operations = (iface.operations ?? []) as Operation[];
    const methods = operations.map(op => {
        const returnType = op.type?.ref ? printSpringType(op) : 'void';
        const params = (op.params ?? []).map(p => `${printSpringType(p)} ${p.name}`).join(', ');
        return `    ${returnType} ${op.name}(${params});`;
    });

    const lines: string[] = [];
    lines.push(`package ${qualifiedPkg};`);
    lines.push('');

    const hasList = operations.some(op =>
        op.upper !== undefined && op.upper !== 1 ||
        (op.params ?? []).some(p => p.upper !== undefined && p.upper !== 1)
    );
    if (hasList) {
        lines.push('import java.util.List;');
    }

    const hasDate = operations.some(op => {
        const checkType = (t: any) => t?.ref?.$type === 'PrimitiveType' && (t.ref.name === 'Date' || t.ref.name === 'DateTime');
        return checkType(op.type) || (op.params ?? []).some(p => checkType(p.type));
    });
    if (hasDate) {
        lines.push('import java.time.LocalDate;');
        lines.push('import java.time.LocalDateTime;');
    }

    // Collect all typed elements (return types + params) for import resolution
    const allTypedElements: TypedElement[] = [];
    for (const op of operations) {
        allTypedElements.push(op);
        for (const p of op.params ?? []) {
            allTypedElements.push(p);
        }
    }
    const typeImports = collectTypeImports(allTypedElements, pkg, '');
    for (const imp of typeImports) {
        lines.push(imp);
    }

    lines.push('');
    lines.push(`public interface ${iface.name} {`);
    lines.push('');
    if (methods.length > 0) {
        lines.push(methods.join('\n'));
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

function toCamel(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1);
}
