import type { ValidationAcceptor, ValidationChecks, Reference } from 'langium';
import type { ClassDiagramAstType, Class, Interface, Type, Property, Operation } from './generated/ast.js';
import type { ClassDiagramServices } from './class-diagram-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: ClassDiagramServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ClassDiagramValidator;
    const checks: ValidationChecks<ClassDiagramAstType> = {
        Class: [ validator.checkTypeStartsWithCapital, validator.checkNoCycleInClassInheritance],
        Interface: [ validator.checkTypeStartsWithCapital, validator.checkNoCycleInInterfaceInheritance],
        DataType: validator.checkTypeStartsWithCapital,
        Enumeration: validator.checkTypeStartsWithCapital,
        Property: validator.checkPropertyStartsWithLower,
        Operation: validator.checkOperationStartsWithLower
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
            const firstChar = o.name.substring(0, 1);
            if (firstChar.toLowerCase() != firstChar) {
                accept('warning', 'Operation name should start with lowercase.', { node: o, property: 'name'});
            }
        }
    }

    checkNoCycleInClassInheritance(c: Class, accept: ValidationAcceptor): void {
        let superClasses: Set<Class> = new Set();
        superClasses.add(c);
        
        if (c.superClasses === undefined) {
            return;
        }

        let superClassesToCheck: Reference<Class>[] = c.superClasses;
        while (superClassesToCheck.length > 0) {
            let superClass = superClassesToCheck.pop();
            if (superClass === undefined) {
                continue;
            } 

            if (superClasses.has(superClass.ref as Class)) {
                accept('error', 'Cycle in class inheritance', { node: c, property: 'superClasses'});
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

        let superInterfacesToCheck: Reference<Interface>[] = i.superInterfaces;
        while (superInterfacesToCheck.length > 0) {
            let superInterface = superInterfacesToCheck.pop();
            if (superInterface === undefined) {
                continue;
            } 

            if (superInterfaces.has(superInterface.ref as Interface)) {
                accept('error', 'Cycle in interface inheritance', { node: i, property: 'superInterfaces'});
            }
            superInterfaces.add(superInterface.ref as Interface);
            superInterfacesToCheck.push(...(superInterface.ref as Interface).superInterfaces || []);            
        }            
    }
    
}
