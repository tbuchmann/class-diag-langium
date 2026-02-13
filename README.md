[![Node.js CI](https://github.com/tbuchmann/class-diag-langium/actions/workflows/node.js.yml/badge.svg)](https://github.com/tbuchmann/class-diag-langium/actions/workflows/node.js.yml)

# Textual modeling language for class diagrams

This project contains the source code for a VS Code extension that allows to specify UML class diagrams using a textual concrete syntax. The textual language was created using Langium.

## Prerequisities

- Install Yeoman
	``npm  i -g yo generator-langium``

- Install node dependencies
	``npm install``

- The extension is able to generate PlantUML syntax which can be used for viewing the modelled system in standard UML diagram notation. To this end, please install the official PlantUML VS Code extension using the VS Code extension manager

## Open directory with VSCode

## Make changes (if required)

- Run the generator afterwards
	``npm run langium:generate``

- Build the extension
	``npm run build``

- Run the tests
	``npm run test``

- Test the extension in a new VSCode instance by pressing <kbd>F5</kbd>

- Build the extension
	``vsce package``
