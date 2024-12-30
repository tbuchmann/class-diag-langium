//import type { Model } from '../language/generated/ast.js';
import { type Enumeration, type Class, type Model, type Package, type Interface, Property, Association } from '../language/generated/ast.js';
import { expandToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';
//import { vi } from 'vitest';


export function generateCode(model: Model, filePath: string, destination: string | undefined): string {
    /*
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.java`;

    const fileNode = expandToNode`
        package ${model.name};

        ${model.packages.map(pkg => `
            package ${pkg.name} {
                ${pkg.types.map(type => `
                    ${type.$type === 'Class' ? `
                        class ${type.name} {
                            ${type.features.map(feature => `
                                ${feature.$type === 'Property' ? `
                                    ${feature.name} : ${feature.type.name}
                                ` : feature.$type === 'Operation' ? `
                                    ${feature.name}(${feature.parameters.map(param => `${param.name} : ${param.type.name}`).join(', ')}) : ${feature.returnType.name}
                                ` : ''}
                            `).join('\n')}
                        }
                    ` : ''}
                `).join('\n')}
            }
        `).join('\n')}
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
    */
   model.packages.forEach(pkg => {
        pkg.types.forEach(type => {
            if (type.$type === 'Class') {
                generateJavaClass(type, pkg.name, filePath, destination);
            }
        });
   });   
   return destination || '';
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
        ${Array.from(classSet).map(clz => `${clz.superClasses?.map(superClass => `${clz.name} --|> ${superClass.ref?.name}`).join('\n')}
        ${clz.superInterfaces?.map(superInterface => `${clz.name} ..|> ${superInterface.ref?.name}`).join('\n')}`)}
        ${Array.from(interfaceSet).map(inf => genSuperInterfaces(inf)).join('\n')}
        ${Array.from(assocSet).map(assoc => `${assoc.properties?.[0].type.ref?.name} "${assoc.properties?.[0].upper}" ${assocTypeMap.get(assoc.properties?.[0].kind ?? 'none')} ${assoc.properties?.[1].upper} ${assoc.properties?.[1].type.ref?.name} : ${assoc.name} >`).join('\n')}
        @enduml
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}


export function generateJavaClass(clz: Class, pkgName: string, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.java`;

    const fileNode = expandToNode`
        package ${clz.$container};

        public class ${clz.name} {
        
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
    let str = i.superInterfaces?.map(superInterface => `${i.name} ..|> ${superInterface.ref?.name}`).join('\n');
    console.log(str);
    return str;
}

// function generatePlantUMLType(type: Class | Interface | Enumeration): string {
    
// }
