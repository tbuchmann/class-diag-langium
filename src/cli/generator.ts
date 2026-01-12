import { type Enumeration, type Class, type Model, type Package, type Interface, Property, type Type, type Association, PrimitiveType, DataType, TypedElement, Operation } from '../language/generated/ast.js';
import { expandToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';


const typeMap = new Map<string, string>();
    typeMap.set('Decimal', 'Double');
    typeMap.set('String', 'String');
    typeMap.set('Boolean', 'Boolean');
    typeMap.set('Integer', 'Integer');

export function generateCode(model: Model, filePath: string, destination: string | undefined): string {
   const allTypes = collectAllTypes(model);
   allTypes.forEach(type => {
        if (type.$type === 'Class') {
            generateJavaClass(type, type.$container.name, filePath, destination);
        } else if (type.$type === 'Interface') {
            generateJavaInterface(type, type.$container.name, filePath, destination);
        } else if (type.$type === 'DataType') {
            generateJavaRecord(type, type.$container.name, filePath, destination);
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

/**
 * Used for code generation: Determines, whether the given class has any associations with other classes.
 * @param model 
 * @param clz 
 * @returns array with matching associations
 */
function collectAllAssociations(model: Model, clz: Class) : Array<Association> {
    const assocs: Array<Association> = [];

    function collect(pkg: Package) {
        pkg.types.forEach(type => {
            if (type.$type === 'Association' && (type as Association).properties?.some(prop => prop.type?.ref === clz)) {
                assocs.push(type);
            }
        });
        pkg.packages.forEach(subPkg => collect(subPkg));
    }

    model.packages.forEach(pkg => collect(pkg));
    return assocs;
}

function findRoot(type: Type) : Model {    
    let model: Model = {} as Model;
    let current: Package | undefined = type.$container;
    while (current !== undefined) {
        if (current.$container.$type === 'Model') {
            model = current.$container;
            break;
        }
        current = current.$container;
    }
    return model;
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
    const dtSet = new Set<DataType>();
    const ptSet = new Set<PrimitiveType>();

    pkg.types.forEach(type => {
        if (type.$type === 'Class') {
            classSet.add(type);
        } else if (type.$type === 'Enumeration') {
            enumSet.add(type);
        }  else if (type.$type === 'Interface') {
            interfaceSet.add(type);
        } else if (type.$type === 'Association') {
            assocSet.add(type);
        } else if (type.$type === 'DataType') {
            dtSet.add(type);
        } else if (type.$type === 'PrimitiveType') {
            ptSet.add(type);
        }
    });

    const fileNode = expandToNode`
        @startuml
        ${Array.from(ptSet).map(pt => `class ${pt.name} <<PrimitiveType>>`).join('\n')}
        ${Array.from(dtSet).map(dt => `class ${dt.name} <<DataType>> {                
            ${dt.properties?.map(prop => `${visMap.get((prop as Property).vis ?? 'package')} ${(prop as Property).static ? '{static}' : ''} ${prop.name} : ${prop.type?.ref?.name} ${genCardinality(prop as Property)}`).join('\n')}            
          }`).join('\n')}
        ${Array.from(classSet).map(clz => `${clz.abstract ? 'abstract ' : ''}class ${clz.name} {                
          ${clz.properties?.map(prop => `${visMap.get((prop as Property).vis ?? 'package')} ${(prop as Property).static ? '{static}' : ''} ${prop.name} : ${prop.type?.ref?.name} ${genCardinality(prop as Property)}`).join('\n')}
          ${clz.operations?.map(op => `${visMap.get((op as Operation).vis ?? 'package')} ${(op as Operation).static ? '{static}' : ''} ${(op as Operation).abstract ? '{abstract}' : ''} ${op.name}(${(op as Operation).params.map(param => `${param.name} : ${param.type?.ref?.name}`).join(', ')}) : ${op.type?.ref?.name}`).join('\n')}
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
        ${Array.from(assocSet).map(assoc => `${assoc.properties?.[0].type?.ref?.name} "${assoc.properties?.[0].upper ?? 1}" ${assocTypeMap.get((assoc.properties?.[1] as Property).kind ?? 'none')} "${assoc.properties?.[1].upper ?? 1}" ${assoc.properties?.[1].type?.ref?.name} : ${assoc.name} >`).join('\n')}
        ${(dtSet.size > 0) ? `hide <<DataType>> circle` : ''}
        ${(ptSet.size > 0) ? `hide <<PrimitiveType>> circle` : ''}
        ${(ptSet.size > 0) ? `hide <<PrimitiveType>> members` : ''}
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

    const root = findRoot(clz);   
    const assocs = collectAllAssociations(root, clz);

    const hasMultipleProperties = clz.properties?.some(prop => prop.upper !== undefined && prop.upper > 1) || clz.operations?.some(op => op.upper !== undefined && op.upper > 1) || assocs.some(assoc => assoc.properties?.some(prop => prop.upper !== undefined && (prop.upper > 1 || prop.upper === -1)));         

    //${(prop as Property).vis ?? ''}

    // TODO: what about reflexive associations?
    // ${assocs.map(assoc => `${assoc.properties?.filter(prop => (prop as Property).type.ref !== clz).map(prop => `private ${(prop as Property).static ? ' static' : ''} ${printType(prop)} ${prop.name}${prop.upper !== undefined && prop.upper > 1 ? ' = new ArrayList<'+prop.type?.ref?.name+ '>()' :''};`).join('\n')}`).join('\n')}            

    const assocProps = assocs.map(assoc => 
        assoc.properties?.filter(prop => (prop as Property).type.ref !== clz) ?? []
    ).flat();

    const fileNode = expandToNode`
        package ${getQualifiedName(clz.$container, '.')};
        ${hasMultipleProperties ? `import java.util.List;\nimport java.util.ArrayList;\nimport java.util.Collections;` : ''}

        public ${clz.abstract ? 'abstract ':''}class ${clz.name} ${printExtendsAndImplements(clz)} {
            // generated properties
            ${clz.properties?.map(prop => `private ${(prop as Property).static ? ' static' : ''} ${printType(prop)} ${prop.name}${prop.upper !== undefined && (prop.upper > 1 || prop.upper === -1) ? ' = new ArrayList<'+prop.type?.ref?.name+ '>()' :''};`).join('\n')}
            // end of generated properties

            // generated associations
            ${assocProps.map(prop => `private ${(prop as Property).static ? ' static' : ''} ${printType(prop)} ${prop.name}${prop.upper !== undefined && (prop.upper > 1 || prop.upper === -1) ? ' = new ArrayList<'+prop.type?.ref?.name+ '>()' :''};`).join('\n')}
            // end of generated associations

            // generated getters and setters
            ${clz.properties?.map(prop => `${genGetter(prop as Property)}\n${genSetter(prop as Property)}`).join('\n')}
            // end of generated getters and setters

            // generated accessors for associations
            ${assocProps.map(prop => `${genAssocGetter(prop as Property)}\n${genAssocSetter(prop as Property)}`).join('\n')}
            // end of generated accessors for associations

            // generated operations
            ${clz.operations?.map(op => genOperation(op as Operation, clz.name)).join('\n')}
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

            ${inf.operations?.map(op => `${op.type === undefined ? 'void' : printType(op)} ${op.name}(${(op as Operation).params.map(param => `${printType(param)} ${param.name}`).join(', ')});`).join('\n')}
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
    const gen = `${p.vis ?? 'public'}${p.static ? ' static' : ''} ${printType(p)} get${p.name.charAt(0).toUpperCase() + p.name.slice(1)}() {
        return this.${p.name};
    }`;
    return gen;
}

function genSetter(p: Property): string {
    const gen = `${p.vis ?? 'public'}${p.static ? ' static' : ''} void set${p.name.charAt(0).toUpperCase() + p.name.slice(1)}(${printType(p)} ${p.name}) {
        this.${p.name} = ${p.name};
    }`;
    return gen;
}

function genAssocGetter(p : Property): string {
    let gen = '';
    if (p.upper == 1) {
    gen = `${p.vis ?? 'public'} ${printType(p)} get${p.name.charAt(0).toUpperCase() + p.name.slice(1)}() {
        return this.${p.name};
    }`;
    } else {
    gen = `${p.vis ?? 'public'}  ${printType(p)} get${p.name.charAt(0).toUpperCase() + p.name.slice(1)}() {
        return (${printType(p)}) Collections.unmodifiableList(this.${p.name});
    }
        
    ${p.vis ?? 'public'} int sizeOf${p.name.charAt(0).toUpperCase() + p.name.slice(1)}() {
        return this.${p.name}.size();
    }`;            
    }
    return gen;
}

function genAssocSetter(p: Property): string {
    let gen = '';
    if (p.upper == 1) {
    gen = `${p.vis ?? 'public'} void set${p.name.charAt(0).toUpperCase() + p.name.slice(1)}(${printType(p)} newValue) {
        if (this.${p.name} != newValue) {
            ${p.type.ref?.name} oldValue = ${p.name};
            if (oldValue != null) {
                this.${p.name} = null;			
                ${getOppositeCardinality(p) == -1 ? removeOldValue(p) : unsetOldValue(p)}
            }
            this.${p.name} = newValue;
            if (newValue != null)			
                ${getOppositeCardinality(p) !== 1 ? addNewValue(p) : setNewValue(p)}
        }
    }`;
    }
    else {
    gen = `${p.vis ?? 'public'} void addTo${p.name.charAt(0).toUpperCase() + p.name.slice(1)}(${p.type.ref?.name} newValue) {
        if (newValue != null && !this.${p.name}.contains(newValue)) {
		this.${p.name}.add(newValue);		
		${getOppositeCardinality(p) === 1 ? `newValue.set${getOppositeProperty(p)?.name.charAt(0).toUpperCase() + getOppositeProperty(p)?.name.slice(1)}(this);`
             : `newValue.addTo${getOppositeProperty(p)?.name.charAt(0).toUpperCase() + getOppositeProperty(p)?.name.slice(1)}(this);`}
	    }
    }
    
    ${p.vis ?? 'public'} void removeFrom${p.name.charAt(0).toUpperCase() + p.name.slice(1)}(${p.type.ref?.name} oldValue) {
        if (oldValue != null && this.${p.name}.contains(oldValue)) {
		this.${p.name}.remove(oldValue);				
        ${getOppositeCardinality(p) === 1 ? `oldValue.set${getOppositeProperty(p)?.name.charAt(0).toUpperCase() + getOppositeProperty(p)?.name.slice(1)}(null);`
             : `oldValue.removeFrom${getOppositeProperty(p)?.name.charAt(0).toUpperCase() + getOppositeProperty(p)?.name.slice(1)}(this);`}
	    }
    }`;
    }
    return gen;
}

function printType(t: TypedElement | undefined): string {
    if (t === undefined) return '';
    let typeName = '';
    if (t.type?.ref?.$type === 'PrimitiveType') {
        typeName = typeMap.get(t.type?.ref?.name) ?? '';
    } else {
        typeName = t.type?.ref?.name ?? '';
    }
    const gen = `${t.upper !== undefined && t.upper !== 1 ? 'List<' + typeName + '>': typeName}`;

    return gen;
}

function generateJavaRecord(type: DataType, name: string, filePath: string, destination: string | undefined) {
    const data = extractDestinationAndName(filePath, destination + "/" + getQualifiedName(type.$container, '/'));
    const generatedFilePath = `${path.join(data.destination, type.name)}.java`;

    const fileNode = expandToNode`
        package ${getQualifiedName(type.$container, '.')};

        public record ${type.name}(${type.properties?.map(prop => `${printType(prop)} ${prop.name}`).join(', ')}) {}
    `.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}

/*
function getOppositeType(prop: Property): Type | undefined {
    if (prop.$container.$type !== 'Association') {
        return undefined;
    }
    return (prop.$container.properties?.filter(p => p !== prop).findLast as unknown as Property).type?.ref;
}
*/

function getOppositeCardinality(prop: Property): number {
    if (prop.$container.$type !== 'Association') {
        return 0;
    }
    /*return (prop.$container.properties?.filter(p => p !== prop).findLast as unknown as Property).upper ?? 0;*/
    return (prop.$container.properties?.filter(p => p !== prop)[0] as Property).upper ?? 0;
}

function getOppositeProperty(prop: Property): Property {
    if (prop.$container.$type !== 'Association') {
        return prop;
    }
    //return (prop.$container.properties?.filter(p => p !== prop).findLast as unknown as Property);
    return prop.$container.properties?.filter(p => p !== prop)[0] as Property;
}

function removeOldValue(prop: Property): string {
    const genString = 'oldValue.removeFrom' + 
        getOppositeProperty(prop)?.name.charAt(0).toUpperCase() + 
        getOppositeProperty(prop)?.name.slice(1) + 
        '(this);';

    return genString;
}

function unsetOldValue(prop: Property): string {
    const genString = 'oldValue.set' +
        getOppositeProperty(prop)?.name.charAt(0).toUpperCase() + 
        getOppositeProperty(prop)?.name.slice(1) + '(null);'

    return genString;
}

function addNewValue(prop: Property): string {
    const genString = 'newValue.addTo' +
        getOppositeProperty(prop)?.name.charAt(0).toUpperCase() + 
        getOppositeProperty(prop)?.name.slice(1) + 
        '(this);';
    return genString;
}

function setNewValue(prop: Property): string {
    const genString = 'newValue.set' +
        getOppositeProperty(prop)?.name.charAt(0).toUpperCase() + 
        getOppositeProperty(prop)?.name.slice(1) + '(this);';

    return genString;
}

function genOperation(op: Operation, className: string): string {
    const isConstructor = op.name === className;
    const javaDoc = printJavaDoc(op);
    const visibility = op.vis ?? '';
    const staticModifier = op.static ? ' static' : '';
    const abstractModifier = op.abstract ? ' abstract' : '';
    const returnType = isConstructor ? '' : (op.type === undefined ? 'void' : printType(op));
    const returnTypePrefix = returnType ? `${returnType} ` : '';
    const signature = `${visibility}${staticModifier}${abstractModifier} ${returnTypePrefix}${op.name}(${op.params.map(param => `${printType(param)} ${param.name}`).join(', ')})`.trim();
    const body = op.abstract ? ';' : printBody(op);
    
    return `${javaDoc}${javaDoc ? '\n' : ''}${signature}${body}`.trim();
}

function printJavaDoc(op : Operation) : string {
    if (op.description === undefined) {
        return '';
    }
    const genString = `/**
    * @prompt ${op.description?.replace(/\n/g, '\n* ')}
    * ${op.content !== undefined ? ` @generated NOT` : ''}
    */`;
    return genString;
}

function printBody(op : Operation): string {
    const genString = ` {
        //generated start
        //generated end
        // insert your code here
        ${op.content !== undefined ? op.content?.replace('<<', '').replace('>>', ''): ''}    
    }`;

    return genString;
}
/*
function printImplementation(op : Operation): string {
    const genString = `${op.implementation?.replace(/\n/g, '\n')}`;

    return genString;
}
*/
