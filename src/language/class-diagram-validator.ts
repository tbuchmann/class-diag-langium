import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { ClassDiagramAstType, Class } from './generated/ast.js';
import type { ClassDiagramServices } from './class-diagram-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: ClassDiagramServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ClassDiagramValidator;
    const checks: ValidationChecks<ClassDiagramAstType> = {
        Class: validator.checkPersonStartsWithCapital
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class ClassDiagramValidator {

    checkPersonStartsWithCapital(clz: Class, accept: ValidationAcceptor): void {
        if (clz.name) {
            const firstChar = clz.name.substring(0, 1);
            if (firstChar.toUpperCase() !== firstChar) {
                accept('warning', 'Person name should start with a capital.', { node: clz, property: 'name' });
            }
        }
    }

}
