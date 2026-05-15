[![Node.js CI](https://github.com/tbuchmann/class-diag-langium/actions/workflows/node.js.yml/badge.svg)](https://github.com/tbuchmann/class-diag-langium/actions/workflows/node.js.yml)

# class-diag

`class-diag` is a VS Code extension for writing UML-style class diagrams in a textual DSL (`.cdiag`).

It provides:
- language support in VS Code (syntax highlighting, validation, completion)
- Java code generation from `.cdiag` models
- live diagram preview based on PlantUML

## Installation

### Option 1: Install from VSIX
1. Download a `.vsix` package from your release/build artifacts.
2. In VS Code, open **Extensions**.
3. Use **... → Install from VSIX...** and select the file.

### Option 2: Build and install from source
```bash
npm install
npm run langium:generate
npm run build
```

Then package/install the extension (for example with `vsce package` and **Install from VSIX...**).

## Quick start

1. Create a file with extension `.cdiag`.
2. Add a model, for example:

```cdiag
package demo {
    primitive Integer
    primitive String

    class Person {
        name : String
        age : Integer
    }

    class Student extends Person {
        matrikelNr : String
    }

    interface Enrollable {
        enroll(course : String) : Integer {}
    }

    class Course implements Enrollable {
        title : String
        enroll(course : String) : Integer {}
    }
}
```

3. Open the command palette and run **Class Diagram: Open Diagram Preview**.
4. Save the file to trigger diagram generation (`generated/*.classdiag`).

## Main features

### 1) Textual class diagram language
Supported model elements:
- `package` (including nested packages)
- `class` (with `abstract`, `extends`, `implements`)
- `interface` (with `extends`)
- `datatype`
- `primitive`
- `enum`
- `assoc`
- properties, operations, parameters, multiplicities, visibility

### 2) Validation in editor
The language server validates, for example:
- duplicate names (types, properties, operations, enum literals, packages)
- inheritance cycles
- naming conventions (type names uppercase start, property/operation names lowercase start)

### 3) Diagram preview
Use **Class Diagram: Open Diagram Preview** to open a live PlantUML-based preview.

Notes:
- preview updates automatically while editing
- package selector is shown when multiple packages contain types
- rendering uses `https://www.plantuml.com` (internet connection required)

### 4) Java generation
Use **Class Diagram: Generate Java Code** from the file context menu to generate Java sources for the active model.

## CLI usage

After building the project, the CLI can be used like this:

```bash
node ./bin/cli.js generate path/to/model.cdiag -d path/to/output
```

## File extension

- `.cdiag`

## Troubleshooting

- **Build errors about `src/language/generated/*`**  
  Run `npm run langium:generate` before `npm run build`.

- **Preview does not render**  
  Check internet access and model syntax errors.

- **No Java files generated**  
  Ensure the model contains classes/interfaces/datatypes/enums and run generation again.
