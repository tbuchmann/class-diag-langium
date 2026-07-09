import type { ValidationAcceptor, ValidationChecks, Reference } from 'langium';
import type { ClassDiagramAstType, Classifier, Class, Interface, Type, Property, Operation, Enumeration, Package, DataType, Model } from './generated/ast.js';
import type { ClassDiagramServices } from './class-diagram-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: ClassDiagramServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ClassDiagramValidator;
    const checks: ValidationChecks<ClassDiagramAstType> = {
        Class: [ validator.checkTypeStartsWithCapital, validator.checkNoCycleInClassInheritance, validator.checkDuplicateTypeName, validator.checkImplicitManyToOne ],
        Interface: [ validator.checkTypeStartsWithCapital, validator.checkNoCycleInInterfaceInheritance, validator.checkDuplicateTypeName],
        DataType: [ validator.checkTypeStartsWithCapital, validator.checkDuplicateTypeName, validator.checkDtoPackageConvention ],
        Enumeration: [ validator.checkTypeStartsWithCapital, validator.checkDuplicateTypeName, validator.checkDuplicateEnumerationLiteralName, validator.checkEnumLiteralIsCapital ],
        Property: [ validator.checkPropertyStartsWithLower, validator.checkDuplicatePropertyName ],
        Operation: [ validator.checkOperationStartsWithLower, validator.checkDuplicateOperationName ],        
        Package: [ validator.checkDuplicatePackageName],
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class ClassDiagramValidator {

    checkTypeStartsWithCapital(t: Type, accept: ValidationAcceptor): void {
        if (t.name) {
            const firstChar = t.name.substring(0, 1);
            if (firstChar.toUpperCase() !== firstChar) {
                accept('warning', 'Type name should start with a capital.', { node: t, property: 'name' });
            }
        }
    }

    checkPropertyStartsWithLower(p: Property, accept: ValidationAcceptor): void {
        if (p.name) {
            const firstChar = p.name.substring(0, 1);
            if (firstChar.toLowerCase() != firstChar) {
                accept('warning', 'Property name should start with lowercase.', { node: p, property: 'name'});
            }
        }
    }

    checkOperationStartsWithLower(o: Operation, accept: ValidationAcceptor): void {
        if (o.name) {
            // Only exception: Constructors
            if (o.name === (o.$container as Classifier)?.name) {
                return;
            }
            const firstChar = o.name.substring(0, 1);
            if (firstChar.toLowerCase() != firstChar) {
                accept('warning', 'Operation name should start with lowercase.', { node: o, property: 'name'});
            }
        }
    }

    checkEnumLiteralIsCapital(e: Enumeration, accept: ValidationAcceptor): void {
        e.literals.forEach(literal => {
            //const firstChar = literal.substring(0, 1);
            if (!literal.match(/^[A-Z]+$/)) {
                accept('warning', 'Enumeration literal should consist of capitals.', { node: e, property: 'literals' });
            }
            /*
            if (firstChar.toUpperCase() !== firstChar) {
                accept('warning', 'Enumeration literal should start with a capital.', { node: e, property: 'literals' });
            }*/
        });
    }

    checkNoCycleInClassInheritance(c: Class, accept: ValidationAcceptor): void {
        let superClasses: Set<Class> = new Set();
        superClasses.add(c);
        
        if (c.superClasses === undefined) {
            return;
        }

        let superClassesToCheck: Reference<Class>[] = [...c.superClasses];
        while (superClassesToCheck.length > 0) {
            let superClass = superClassesToCheck.pop();
            if (superClass === undefined) {
                continue;
            } 

            if (superClasses.has(superClass.ref as Class)) {
                accept('error', 'Cycle in class inheritance', { node: c, property: 'superClasses'});
                return;
            }
            superClasses.add(superClass.ref as Class);            
            superClassesToCheck.push(...(superClass.ref as Class).superClasses || []);            
        }            
    }

    checkNoCycleInInterfaceInheritance(i: Interface, accept: ValidationAcceptor): void {
        let superInterfaces: Set<Interface> = new Set();
        superInterfaces.add(i);
        
        if (i.superInterfaces === undefined) {
            return;
        }

        let superInterfacesToCheck: Reference<Interface>[] = [...i.superInterfaces];
        while (superInterfacesToCheck.length > 0) {
            let superInterface = superInterfacesToCheck.pop();
            if (superInterface === undefined) {
                continue;
            } 

            if (superInterfaces.has(superInterface.ref as Interface)) {
                accept('error', 'Cycle in interface inheritance', { node: i, property: 'superInterfaces'});
                return;
            }
            superInterfaces.add(superInterface.ref as Interface);
            superInterfacesToCheck.push(...(superInterface.ref as Interface).superInterfaces || []);            
        }            
    }

    checkDuplicateTypeName(t: Type, accept: ValidationAcceptor): void {        
        t.$container?.types.forEach(type => {
            if (type !== t && type.name === t.name) {
                accept('error', `Duplicate type name '${t.name}'.`, { node: t, property: 'name' });
            }
        });
    }

    checkDuplicatePropertyName(p: Property, accept: ValidationAcceptor): void {        
        if ('properties' in p.$container) {
            p.$container?.properties.forEach(property => {
                if (property !== p && property.name === p.name) {
                    accept('error', `Duplicate property name '${p.name}'.`, { node: p, property: 'name' });
                }
            });
        }
    }

    checkDuplicateOperationName(o: Operation, accept: ValidationAcceptor): void {        
        //if ('operations' in o.$container) {
            (o.$container as Classifier)?.operations.forEach(operation => {
                if (operation !== o && operation.name === o.name) {
                    accept('error', `Duplicate operation name '${o.name}'.`, { node: o, property: 'name' });
                }
            });
        //}
    }
    
    checkDuplicateEnumerationLiteralName(e: Enumeration, accept: ValidationAcceptor): void {        
        let litNames = new Array<string>();
        e.literals.forEach(literal => {
            if (litNames.includes(literal)) {
                accept('error', `Duplicate enumeration literal name '${literal}'.`, { node: e, property: 'literals' });
            }
            litNames.push(literal);
        });
    }

    checkDuplicatePackageName(p: Package, accept: ValidationAcceptor): void {        
        p.$container?.packages.forEach(pkg => {
            if (pkg !== p && pkg.name === p.name) {
                accept('error', `Duplicate package name '${p.name}'.`, { node: p, property: 'name' });
            }
        });
    }

    checkImplicitManyToOne(clz: Class, accept: ValidationAcceptor): void {
        const model: Model | undefined = (() => {
            let current: Package | undefined = clz.$container as Package;
            while (current !== undefined) {
                if ((current.$container as { $type?: string })?.$type === 'Model') {
                    return current.$container as unknown as Model;
                }
                current = current.$container as Package | undefined;
            }
            return undefined;
        })();

        if (!model) return;

        // find assocs that reference clz on one side and the target property on the other
        function hasCoveringAssoc(propName: string, referencedClass: Class): boolean {
            let found = false;
            function search(pkg: Package) {
                pkg.types.forEach(t => {
                    if (t.$type === 'Association') {
                        const props = (t as { properties?: Property[] }).properties ?? [];
                        const refersClz = props.some(p => p.type?.ref === clz);
                        const refersOther = props.some(p => p.type?.ref === referencedClass && p.name === propName);
                        if (refersClz && refersOther) found = true;
                    }
                });
                pkg.packages.forEach(sub => search(sub));
            }
            model!.packages.forEach(pkg => search(pkg));
            return found;
        }

        (clz.properties as Property[]).forEach(p => {
            if (p.type?.ref?.$type === 'Class') {
                if (!hasCoveringAssoc(p.name, p.type.ref as Class)) {
                    accept(
                        'warning',
                        `Property '${p.name}' references class '${p.type.ref.name}' without an explicit association. ` +
                        `Consider adding an 'assoc' block (implicit @ManyToOne will be generated).`,
                        { node: p, property: 'name' },
                    );
                }
            }
        });
    }

    checkDtoPackageConvention(t: DataType, accept: ValidationAcceptor): void {
        const pkg = t.$container as Package;
        const pkgNameLower = pkg.name.toLowerCase();
        if (!['dto', 'request', 'response'].includes(pkgNameLower)) return;
        const st: string | undefined = (t as { stereotype?: string }).stereotype;
        if (st === '@dto' || st === '@request' || st === '@response') return;
        accept(
            'hint',
            `DataType '${t.name}' in a '${pkg.name}' package should carry a @dto, @request, or @response stereotype for clarity.`,
            { node: t, property: 'name' },
        );
    }

}
