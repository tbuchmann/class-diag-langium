import type { ValidationAcceptor, ValidationChecks } from 'langium';
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
        Interface: validator.checkTypeStartsWithCapital,
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

    }

    checkNoCycleInInterfaceInheritance(i: Interface, accept: ValidationAcceptor): void {

    }
    
}
