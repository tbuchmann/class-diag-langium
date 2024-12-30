import { type Enumeration, type Class, type Model, type Package, type Interface, Property, Association, PrimitiveType, DataType } from '../language/generated/ast.js';
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

function collectAllTypes(model: Model): Array<Class | DataType | PrimitiveType | Enumeration | Interface | Association> {
    const types: Array<Class | DataType | PrimitiveType | Enumeration | Interface | Association> = [];

    function collect(pkg: Package) {
        pkg.types.forEach(type => types.push(type));
        pkg.packages.forEach(subPkg => collect(subPkg));
    }

    model.packages.forEach(pkg => collect(pkg));
    return types;
}

export function generateClassDiagram(pkg: Package, filePath: string, destination: string) : string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name + pkg.name)}.classdiag`;

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
        ${Array.from(classSet).map(clz => `class ${clz.name} {                
          ${clz.properties?.map(prop => `${visMap.get(prop.vis ?? 'package')} ${prop.name} : ${prop.type?.ref?.name} ${genCardinality(prop)}`).join('\n')}
          ${clz.operations?.map(op => `${visMap.get(op.vis ?? 'package')} ${op.name}(${op.params.map(param => `${param.name} : ${param.type?.ref?.name}`).join(', ')}) : ${op.type?.ref?.name}`).join('\n')}
        }`).join('\n')}
        ${Array.from(enumSet).map(enm => `enum ${enm.name} {
          ${enm.literals.join('\n')}
        }`).join('\n')}
        ${Array.from(interfaceSet).map(inf => `interface ${inf.name} {
          ${inf.properties?.map(prop => `${visMap.get(prop.vis ?? 'package')} ${prop.name} : ${prop.type?.ref?.name} ${genCardinality(prop)}`).join('\n')}
                ${inf.operations?.map(op => `${visMap.get(op.vis ?? 'package')} ${op.name}(${op.params.map(param => `${param.name} : ${param.type?.ref?.name}`).join(', ')}) : ${op.type?.ref?.name}`).join('\n')}
        }`).join('\n')}
        ${Array.from(classSet).map(clz => genSuperClasses(clz)).join('\n')}
        ${Array.from(classSet).map(clz => genImplementingInterfaces(clz)).join('\n')}
        ${Array.from(interfaceSet).map(inf => genSuperInterfaces(inf)).join('\n')}
        ${Array.from(assocSet).map(assoc => `${assoc.properties?.[0].type.ref?.name} "${assoc.properties?.[0].upper ?? 1}" ${assocTypeMap.get(assoc.properties?.[0].kind ?? 'none')} "${assoc.properties?.[1].upper ?? 1}" ${assoc.properties?.[1].type.ref?.name} : ${assoc.name} >`).join('\n')}
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

    const fileNode = expandToNode`
        package ${getQualifiedName(clz.$container, '.')};

        public class ${clz.name} ${printExtendsAndImplements(clz)} {
            ${clz.properties?.map(prop => `${prop.vis ?? ''} ${prop.type?.ref?.name} ${prop.name};`).join('\n')}

            ${clz.operations?.map(op => `${op.vis ?? ''} ${op.type?.ref?.name ?? 'void'} ${op.name}(${op.params.map(param => `${param.type?.ref?.name} ${param.name}`).join(', ')}) {}`).join('\n')}
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
            ${inf.properties?.map(prop => `${prop.type?.ref?.name} ${prop.name} = null;`).join('\n')}

            ${inf.operations?.map(op => `${op.type?.ref?.name ?? 'void'} ${op.name}(${op.params.map(param => `${param.type?.ref?.name} ${param.name}`).join(', ')});`).join('\n')}
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

