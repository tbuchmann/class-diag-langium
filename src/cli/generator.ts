import { type Enumeration, type Class, type Model, type Package, type Interface, Property, Association, PrimitiveType, DataType, TypedElement, Operation } from '../language/generated/ast.js';
import { expandToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';

export function generateCode(model: Model, filePath: string, destination: string | undefined): string {
   const allTypes = collectAllTypes(model);
   allTypes.forEach(type => {
        if (type.$type === 'Class') {
            generateJavaClass(type, type.$container.name, filePath, destination);
        } else if (type.$type === 'Interface') {
            generateJavaInterface(type, type.$container.name, filePath, destination);
        }
    });    
   
   return destination || '';
}

export function generateDiagrams(model: Model, filePath: string, destination: string | undefined): string {
    const allPkgs = collectAllPackages(model);
    allPkgs.forEach(pkg => { if (pkg.types.length > 0) generateClassDiagram(pkg, filePath, destination);        
    });

    return destination || '';
}

function collectAllTypes(model: Model): Array<Class | DataType | PrimitiveType | Enumeration | Interface | Association> {
    const types: Array<Class | DataType | PrimitiveType | Enumeration | Interface | Association> = [];

    function collect(pkg: Package) {
        pkg.types.forEach(type => types.push(type));
        pkg.packages.forEach(subPkg => collect(subPkg));
    }

    model.packages.forEach(pkg => collect(pkg));
    return types;
}

function collectAllPackages(model: Model) : Array<Package> {
    const pkgs: Array<Package> = [];

    function collect(pkg: Package) {
        pkgs.push(pkg);
        pkg.packages.forEach(subPkg => collect(subPkg));
    }

    model.packages.forEach(pkg => collect(pkg));
    return pkgs;
}

export function generateClassDiagram(pkg: Package, filePath: string, destination: string | undefined) : string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name + getQualifiedName(pkg, "."))}.classdiag`;

    const visMap = new Map<string, string>();
    visMap.set('public', '+');
    visMap.set('protected', '#');
    visMap.set('private', '-');
    visMap.set('package', '~');

    const assocTypeMap = new Map<string, string>();
    assocTypeMap.set('none', '--');
    assocTypeMap.set('shared', 'o--');
    assocTypeMap.set('composite', '*--');

    const classSet = new Set<Class>();
    const enumSet = new Set<Enumeration>();
    const interfaceSet = new Set<Interface>();
    const assocSet = new Set<Association>();

    pkg.types.forEach(type => {
        if (type.$type === 'Class') {
            classSet.add(type);
        } else if (type.$type === 'Enumeration') {
            enumSet.add(type);
        }  else if (type.$type === 'Interface') {
            interfaceSet.add(type);
        } else if (type.$type === 'Association') {
            assocSet.add(type);
        }
    });

    const fileNode = expandToNode`
        @startuml
        ${Array.from(classSet).map(clz => `${clz.abstract ? 'abstract ' : ''}class ${clz.name} {                
          ${clz.properties?.map(prop => `${visMap.get((prop as Property).vis ?? 'package')} ${prop.name} : ${prop.type?.ref?.name} ${genCardinality(prop as Property)}`).join('\n')}
          ${clz.operations?.map(op => `${visMap.get((op as Operation).vis ?? 'package')} ${op.name}(${(op as Operation).params.map(param => `${param.name} : ${param.type?.ref?.name}`).join(', ')}) : ${op.type?.ref?.name}`).join('\n')}
        }`).join('\n')}
        ${Array.from(enumSet).map(enm => `enum ${enm.name} {
          ${enm.literals.join('\n')}
        }`).join('\n')}
        ${Array.from(interfaceSet).map(inf => `interface ${inf.name} {
          ${inf.properties?.map(prop => `${visMap.get((prop as Property).vis ?? 'package')} ${prop.name} : ${prop.type?.ref?.name} ${genCardinality(prop as Property)}`).join('\n')}
                ${inf.operations?.map(op => `${visMap.get((op as Operation).vis ?? 'package')} ${op.name}(${(op as Operation).params.map(param => `${param.name} : ${param.type?.ref?.name}`).join(', ')}) : ${op.type?.ref?.name}`).join('\n')}
        }`).join('\n')}
        ${Array.from(classSet).map(clz => genSuperClasses(clz)).join('\n')}
        ${Array.from(classSet).map(clz => genImplementingInterfaces(clz)).join('\n')}
        ${Array.from(interfaceSet).map(inf => genSuperInterfaces(inf)).join('\n')}
        ${Array.from(assocSet).map(assoc => `${assoc.properties?.[0].type?.ref?.name} "${assoc.properties?.[0].upper ?? 1}" ${assocTypeMap.get((assoc.properties?.[0] as Property).kind ?? 'none')} "${assoc.properties?.[1].upper ?? 1}" ${assoc.properties?.[1].type?.ref?.name} : ${assoc.name} >`).join('\n')}
        @enduml
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}


export function generateJavaClass(clz: Class, pkgName: string, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination + "/" + getQualifiedName(clz.$container, '/'));
    const generatedFilePath = `${path.join(data.destination, clz.name)}.java`;

    const hasMultipleProperties = clz.properties?.some(prop => prop.upper !== undefined && prop.upper > 1) || clz.operations?.some(op => op.upper !== undefined && op.upper > 1);

    const fileNode = expandToNode`
        package ${getQualifiedName(clz.$container, '.')};
        ${hasMultipleProperties ? `import java.util.List;\nimport java.util.ArrayList;` : ''}

        public ${clz.abstract ? 'abstract ':''}class ${clz.name} ${printExtendsAndImplements(clz)} {
            // generated properties
            ${clz.properties?.map(prop => `${(prop as Property).vis ?? ''} ${printType(prop)} ${prop.name}${prop.upper !== undefined && prop.upper > 1 ? ' = new ArrayList<'+prop.type?.ref?.name+ '>()' :''};`).join('\n')}
            // end of generated properties

            // generated getters and setters
            ${clz.properties?.map(prop => `${genGetter(prop as Property)}\n${genSetter(prop as Property)}`).join('\n')}
            // end of generated getters and setters

            // generated operations
            ${clz.operations?.map(op => `${(op as Operation).vis ?? ''} ${op.type === undefined ? 'void' : printType(op)} ${op.name}(${(op as Operation).params.map(param => `${printType(param)} ${param.name}`).join(', ')}) {}`).join('\n')}
        }
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

export function generateJavaInterface(inf: Interface, pkgName: string, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination + "/" + getQualifiedName(inf.$container, '/'));
    const generatedFilePath = `${path.join(data.destination, inf.name)}.java`;

    const fileNode = expandToNode`
        package ${getQualifiedName(inf.$container, '.')};

        public interface ${inf.name} ${printExtends(inf)} {
            ${inf.properties?.map(prop => `${printType(prop)} ${prop.name} = null;`).join('\n')}

            ${inf.operations?.map(op => `${op.type?.ref?.name ?? 'void'} ${op.name}(${(op as Operation).params.map(param => `${param.type?.ref?.name} ${param.name}`).join(', ')});`).join('\n')}
        }
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

function genCardinality(p: Property) : string {
    if (p.lower === 0 && p.upper === 1) {
        return '[0..1]';
    } else if (p.lower === 0 && p.upper === -1) {
        return '[0..*]';
    } else if (p.lower === 1 && p.upper === -1) {
        return '[1..*]';
    } else {
        //return `${p.lowerBound}..${p.upperBound}`;
        return '';
    }
}

function genSuperInterfaces(i: Interface) : string {    
    return i.superInterfaces?.map(superInterface => `${superInterface.ref?.name} <|.. ${i.name}`).join('\n');
}

function genSuperClasses(c: Class) : string {
    return c.superClasses?.map(superClass => `${superClass.ref?.name} <|-- ${c.name}`).join('\n');
}

function genImplementingInterfaces(c: Class) : string {
    return c.superInterfaces?.map(superInterface => `${superInterface.ref?.name} <|.. ${c.name}`).join('\n');
}

function getQualifiedName(pkg: Package, sep: string) : string {
    const names = new Array<string>();
    let current: Package | undefined = pkg;
    while (current !== undefined) {
        names.push(current.name);
        if (current.$container.$type !== 'Model') 
            current = current.$container;
        else
            current = undefined;
    }
    return names.reverse().join(sep).toString();
}

function printExtendsAndImplements(type: Class) : string {
    return type.superClasses?.map(superClass => `extends ${superClass.ref?.name}`).join(', ') + ' ' +
           type.superInterfaces?.map(superInterface => `implements ${superInterface.ref?.name}`).join(', ');
}

function printExtends(type: Interface): string {
    return type.superInterfaces?.map(superInterface => `extends ${superInterface.ref?.name}`).join(', ');
}

function genGetter(p: Property): string {
    const gen = `${p.vis ?? ''} ${printType(p)} get${p.name.charAt(0).toUpperCase() + p.name.slice(1)}() {
        return this.${p.name};
    }`;
    return gen;
}

function genSetter(p: Property): string {
    const gen = `${p.vis ?? ''} void set${p.name.charAt(0).toUpperCase() + p.name.slice(1)}(${printType(p)} ${p.name}) {
        this.${p.name} = ${p.name};
    }`;
    return gen;
}

function printType(t: TypedElement): string {
    const gen = `${t.upper !== undefined && t.upper !== 1 ? 'List<' + t.type?.ref?.name + '>': t.type?.ref?.name}`;

    return gen;
}

