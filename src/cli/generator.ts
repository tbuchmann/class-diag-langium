//import type { Model } from '../language/generated/ast.js';
import { type Enumeration, type Class, type Model, type Package, type Interface } from '../language/generated/ast.js';
import { expandToNode, /*joinToNode,*/ toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';
/*
export function generateJavaScript(model: Model, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.js`;

    const fileNode = expandToNode`
        "use strict";

        ${joinToNode(model.greetings, greeting => `console.log('Hello, ${greeting.person.ref?.name}!');`, { appendNewLineIfNotEmpty: true })}
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}
*/

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
                generateClass(type, pkg.name, filePath, destination);
            }
        });
   });   
   return destination || '';
}

export function generateClassDiagram(pkg: Package, filePath: string, destination: string) : string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.classdiag`;

    let classSet = new Set<Class>();
    let enumSet = new Set<Enumeration>();
    let interfaceSet = new Set<Interface>();

    pkg.types.forEach(type => {
        if (type.$type === 'Class') {
            classSet.add(type);
        } else if (type.$type === 'Enumeration') {
            enumSet.add(type);
        }  else if (type.$type === 'Interface') {
            interfaceSet.add(type);
        }
    });

    const fileNode = expandToNode`
        @startuml
        ${Array.from(classSet).map(clz => `
            class ${clz.name} 
        `).join('\n')}
        ${Array.from(enumSet).map(enm => `
            enum ${enm.name} 
        `).join('\n')}
        ${Array.from(interfaceSet).map(inf => `
            interface ${inf.name} 
        `).join('\n')}
        @enduml
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}


export function generateClass(clz: Class, pkgName: string, filePath: string, destination: string | undefined): string {
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
