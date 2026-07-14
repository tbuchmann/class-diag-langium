import {
    type Class,
    type Interface,
    type Model,
    type Operation,
    type Package,
    type TypedElement,
} from '../language/generated/ast.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';
import { collectTypeImports, getQualifiedName, printSpringType, toSnakeCase } from './generatorSpring.js';

type ControllerTarget = {
    name: string;
    operations: Operation[];
    restPath: string;
    isInterface: boolean;
    entityNames: string[];
};

function collectEntityNames(ops: Operation[]): string[] {
    const names = new Set<string>();
    for (const op of ops) {
        if (op.type?.ref?.$type === 'Class') names.add(op.type.ref.name);
        for (const p of op.params ?? []) {
            if (p.type?.ref?.$type === 'Class') names.add(p.type.ref.name);
        }
    }
    return Array.from(names).sort();
}

function getHttpMapping(
    op: Operation,
): { annotation: string; path: string; params: string[]; responseWrap: string } | undefined {
    const params = op.params ?? [];
    const hasReturn = op.type?.ref !== undefined;
    const isCollection = op.upper !== undefined && op.upper !== 1;
    const firstType = params[0]?.type?.ref?.name;
    const secondType = params[1]?.type?.ref?.name;

    // No params, returns collection → GET /
    if (params.length === 0 && hasReturn && isCollection) {
        return { annotation: 'GetMapping', path: '', params: [], responseWrap: 'collection' };
    }

    // Single ID param (primitive type), returns single → GET /{id}
    if (params.length === 1 && firstType && hasReturn && !isCollection) {
        const paramRefType = params[0]?.type?.ref?.$type;
        if (paramRefType === 'PrimitiveType') {
            return {
                annotation: 'GetMapping',
                path: '/{id}',
                params: [`@PathVariable ${firstType} ${params[0].name}`],
                responseWrap: 'single',
            };
        }
    }

    // Single DTO param (Class or DataType), returns single → POST /
    if (params.length === 1 && firstType && hasReturn && !isCollection) {
        const paramRefType = params[0]?.type?.ref?.$type;
        if (paramRefType === 'Class' || paramRefType === 'DataType') {
            return {
                annotation: 'PostMapping',
                path: '',
                params: [`@RequestBody @Valid ${firstType} ${params[0].name}`],
                responseWrap: 'single',
            };
        }
    }

    // ID param + DTO param, returns single → PUT /{id}
    if (params.length === 2 && firstType && secondType && hasReturn) {
        return {
            annotation: 'PutMapping',
            path: '/{id}',
            params: [
                `@PathVariable ${firstType} ${params[0].name}`,
                `@RequestBody @Valid ${secondType} ${params[1].name}`,
            ],
            responseWrap: 'single',
        };
    }

    // Single ID param, void → DELETE /{id}
    if (params.length === 1 && firstType && !hasReturn) {
        return {
            annotation: 'DeleteMapping',
            path: '/{id}',
            params: [`@PathVariable ${firstType} ${params[0].name}`],
            responseWrap: 'void',
        };
    }

    // No params, void → POST /
    if (params.length === 0 && !hasReturn) {
        return { annotation: 'PostMapping', path: '', params: [], responseWrap: 'void' };
    }

    return undefined;
}

function camelToHuman(name: string): string {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

function buildControllerSource(target: ControllerTarget, delegateType: string, delegateName: string, pkg: Package): string {
    const lines: string[] = [];
    const qualifiedPkg = getQualifiedName(pkg, '.');
    const basePath = target.restPath || `/${toSnakeCase(target.name.replace(/(Service|Resource|Controller)$/, ''))}`;

    lines.push(`package ${qualifiedPkg}.controller;`);
    lines.push('');
    lines.push('import org.springframework.web.bind.annotation.*;');
    if (target.isInterface) {
        lines.push(`import ${qualifiedPkg}.${delegateType};`);
    } else {
        lines.push(`import ${qualifiedPkg}.repository.${delegateType};`);
    }

    const hasResponseEntity = target.operations.some(op => {
        const m = getHttpMapping(op);
        return m && (m.responseWrap === 'single' || m.responseWrap === 'void');
    });
    if (hasResponseEntity) {
        lines.push('import org.springframework.http.ResponseEntity;');
    }

    const hasCollection = target.operations.some(op => {
        const m = getHttpMapping(op);
        return m && m.responseWrap === 'collection';
    });
    const hasListReturnType = target.operations.some(op =>
        op.type?.ref && printSpringType(op).startsWith('List<')
    );
    const hasListParamType = target.operations.some(op =>
        (op.params ?? []).some(p => printSpringType(p).startsWith('List<'))
    );
    if (hasCollection || hasListReturnType || hasListParamType) {
        lines.push('import java.util.List;');
    }

    const hasValid = target.operations.some(op => {
        const m = getHttpMapping(op);
        return m && m.params.some(p => p.includes('@RequestBody'));
    });
    if (hasValid) {
        lines.push('import jakarta.validation.Valid;');
    }

    const hasPreAuthorize = target.operations.some(op => (op as any).preAuthorize);
    if (hasPreAuthorize) {
        lines.push('import org.springframework.security.access.prepost.PreAuthorize;');
    }

    lines.push('import io.swagger.v3.oas.annotations.Operation;');
    lines.push('import io.swagger.v3.oas.annotations.tags.Tag;');

    for (const e of target.entityNames) {
        lines.push(`import ${qualifiedPkg}.domain.${e};`);
    }

    // Collect all typed elements (return types + params) for import resolution
    const allTypedElements: TypedElement[] = [];
    for (const op of target.operations) {
        allTypedElements.push(op);
        for (const p of op.params ?? []) {
            allTypedElements.push(p);
        }
    }
    const typeImports = collectTypeImports(allTypedElements, pkg, 'controller');
    for (const imp of typeImports) {
        lines.push(imp);
    }
    lines.push('');
    lines.push('@RestController');
    lines.push(`@RequestMapping("${basePath}")`);
    lines.push(`@Tag(name = "${basePath}")`);
    const capName = target.name.charAt(0).toUpperCase() + target.name.slice(1);
    lines.push(`public class ${capName}Controller {`);
    lines.push('');
    lines.push(`    private final ${delegateType} ${delegateName};`);
    lines.push('');
    lines.push(`    public ${capName}Controller(${delegateType} ${delegateName}) {`);
    lines.push(`        this.${delegateName} = ${delegateName};`);
    lines.push('    }');
    lines.push('');

    for (const op of target.operations) {
        const mapping = getHttpMapping(op);
        const returnType = op.type?.ref ? printSpringType(op) : 'void';
        const opParams = op.params ?? [];

        if (mapping) {
            const methodParams = mapping.params.join(', ');
            const pathAttr = mapping.path ? `("${mapping.path}")` : '';

            let returnStmt: string;
            let actualReturnType: string;
            if (mapping.responseWrap === 'single') {
                actualReturnType = `ResponseEntity<${returnType}>`;
                returnStmt = `        return ResponseEntity.ok(${delegateName}.${op.name}(${opParams.map(p => p.name).join(', ')}));`;
            } else if (mapping.responseWrap === 'void') {
                actualReturnType = 'ResponseEntity<Void>';
                returnStmt = `        ${delegateName}.${op.name}(${opParams.map(p => p.name).join(', ')});\n        return ResponseEntity.noContent().build();`;
            } else {
                actualReturnType = returnType;
                returnStmt = `        return ${delegateName}.${op.name}(${opParams.map(p => p.name).join(', ')});`;
            }

            const summary = camelToHuman(op.name);
            const specDesc = op.description ? `, description = "${op.description.replace(/"/g, '\\"')}"` : '';
            lines.push(`    @${mapping.annotation}${pathAttr}`);
            lines.push(`    @Operation(summary = "${summary}"${specDesc})`);
            if ((op as any).preAuthorize) {
                lines.push(`    @PreAuthorize(${(op as any).preAuthorize})`);
            }
            lines.push(`    public ${actualReturnType} ${op.name}(${methodParams}) {`);
            lines.push(returnStmt);
            lines.push('    }');
            lines.push('');
        } else {
            // Fallback for unmapped signatures
            const methodParams = opParams.map(p => `${printSpringType(p)} ${p.name}`).join(', ');
            const summary = camelToHuman(op.name);
            lines.push(`    @GetMapping("/${op.name}")`);
            lines.push(`    @Operation(summary = "${summary}")`);
            if ((op as any).preAuthorize) {
                lines.push(`    @PreAuthorize(${(op as any).preAuthorize})`);
            }
            lines.push(`    // TODO: review mapping for operation '${op.name}'`);
            lines.push(`    public ${returnType} ${op.name}(${methodParams}) {`);
            if (returnType === 'void') {
                lines.push(`        ${delegateName}.${op.name}(${opParams.map(p => p.name).join(', ')});`);
            } else {
                lines.push(`        return ${delegateName}.${op.name}(${opParams.map(p => p.name).join(', ')});`);
            }
            lines.push('    }');
            lines.push('');
        }
    }

    lines.push('}');
    lines.push('');

    return lines.join('\n');
}

export function generateController(
    type: Interface | Class,
    model: Model,
    filePath: string,
    destination: string | undefined,
): string {
    const pkg = type.$container as Package;
    const pkgPath = getQualifiedName(pkg, '/', true);
    const data = extractDestinationAndName(filePath, `${destination}${pkgPath ? '/' + pkgPath : ''}/controller`);
    const capName = type.name.charAt(0).toUpperCase() + type.name.slice(1);
    const generatedFilePath = path.join(data.destination, `${capName}Controller.java`);

    const restAnnotation = (type as any).restAnnotation as { path?: string } | undefined;
    const restPath = restAnnotation?.path;
    const operations = ((type as any).operations ?? []) as Operation[];
    const entityNames = collectEntityNames(operations);
    const isInterface = type.$type === 'Interface';

    let delegateType: string;
    let delegateName: string;
    if (isInterface) {
        delegateType = type.name;
        delegateName = type.name.charAt(0).toLowerCase() + type.name.slice(1);
    } else {
        const firstEntity = entityNames[0] ?? type.name;
        delegateType = `${firstEntity}Repository`;
        delegateName = firstEntity.charAt(0).toLowerCase() + firstEntity + 'Repository';
    }

    const target: ControllerTarget = {
        name: type.name,
        operations,
        restPath: restPath ?? '',
        isInterface,
        entityNames,
    };

    const source = buildControllerSource(target, delegateType, delegateName, pkg);

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, source);
    return generatedFilePath;
}
