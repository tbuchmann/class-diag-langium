# PlantUML Webview - Neue Funktionen

Diese Dokumentation beschreibt die neuen interaktiven Funktionen der PlantUML-Vorschau.

## Übersicht

Die Live-Vorschau zeigt PlantUML-Diagramme direkt neben deinem Editor an und bietet mehrere Möglichkeiten zur Interaktion zwischen Diagramm und Text.

## Features

### 1. Live-Aktualisierung

Das Diagramm wird **automatisch aktualisiert**, wenn du den Text im Editor änderst. Keine manuelle Refresh erforderlich!

### 2. Package-Filter

Wenn dein Modell mehrere Packages enthält, wird ein **Dropdown-Menü** angezeigt:

- **"All Packages"**: Zeigt alle Diagramme nebeneinander
- **Package-Namen**: Wähle ein spezifisches Package um nur dessen Diagramm anzuzeigen

Dies ist besonders hilfreich bei großen Modellen mit vielen Packages.

**Verwendung:**
```
1. Webview öffnen (Preview-Button in der Titelleiste)
2. Dropdown auswählen
3. Nur das gewählte Package wird angezeigt
```

### 3. Text-zu-Diagram Verbindung

Das System extrahiert automatisch alle **Klassennamen, Interfaces und Enums** aus deinem PlantUML-Code.

Du kannst diese in der **Browser-Konsole** (F12 → Console) mit folgendem Befehl suchen:

```javascript
findInEditor('MyClassName')
```

Dies wird:
1. Den Editor aktivieren
2. Zur Position "MyClassName" im Text springen
3. Das Element auswählen und hervorheben

**Beispiel:**
```javascript
findInEditor('User')     // Springt zu 'class User'
findInEditor('Service')  // Springt zu 'interface Service'
```

### 4. Visuelles Feedback

- **Hover-Effekt**: Bilder werden bei Hover heller
- **Responsive Layout**: Diagramme passen sich automatisch der Größe an
- **Theme-Integration**: Nutzt dein VS Code Theme (Hell/Dunkel)

## Technische Details

### Package-Filterung

- Packages werden hierarchisch mit Punkt-Notation bezeichnet: `com.example.models`
- Der Filter ist **stateless** - wird bei jedem Tastendruck neu angewendet
- Nested Packages werden unterstützt

### Klassennamen-Extraktion

Das System nutzt Regex um Klassennamen aus PlantUML-Code zu extrahieren:
```
class  ClassName     → MyClass
interface Name      → MyInterface
enum Values         → MyEnum
```

### Synchronisations-Mechanismus

1. **Webview → Editor**: `findInEditor()` Funktion sendet `findInEditor` Message
2. **Extension**: `handleFindInEditor()` sucht Text und springt dorthin
3. **Editor**: Text wird ausgewählt und ins Sichtfenster gescrollt

## Bekannte Limitierungen

1. **PlantUML-Klicks nicht direkt möglich**: Da das Diagramm ein PNG-Bild ist (generiert vom Online Renderer), können wir nicht direkt auf einzelne Elemente klicken. Die `findInEditor()` Konsolen-Funktion ist die Alternative.

2. **Nur erste Match**: Wenn eine Klasse mehrfach vorkommt, springt `findInEditor()` zur ersten Stelle.

3. **Regex-basierte Suche**: Der Klassennamen-Extraktor ist textbasiert, nicht AST-basiert. Komplexe Namen könnten seltene Fehler verursachen.

## Zukunftige Verbesserungen

- [ ] Klick-basierte Navigation (benötigt SVG-Rendering oder interaktive PlantUML-Komponente)
- [ ] Hover-Highlighting im Diagram bei Editor-Cursor-Position
- [ ] Export von Diagrammen als SVG/PNG
- [ ] Zoom und Pan Funktionen
- [ ] Mehrsprachige Fehlermeldungen

## Troubleshooting

### Package-Selector wird nicht angezeigt
- Das bedeutet, dass nur 1 Package mit Typen existiert
- Der Selector wird nur bei 2+ Packages angezeigt

### `findInEditor()` findet die Klasse nicht
Mögliche Ursachen:
1. Der Klassenname existiert nicht im Editor
2. Der Name hat Sonderzeichen oder Leerzeichen
3. Typo in der Eingabe

Überprüfe mit `classIndex` in der Konsole welche Klassen verfügbar sind:
```javascript
console.log(Array.from(classIndex.keys()))
```

### Diagram wird nicht angezeigt
1. Überprüfe die Browser-Konsole (F12) auf JavaScript-Fehler
2. Stelle sicher, dass deine Internetverbindung besteht (PlantUML Online Renderer wird verwendet)
3. Validiere dein .cdiag Modell-Syntax
