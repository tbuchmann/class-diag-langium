# Plan 002 – Spring Boot / JPA Code Generator – Phase 2

> **Status:** Planung abgeschlossen (Stand: April 2026)
> **Voraussetzung:** Plan 001 / Phase 1 vollständig implementiert (Iterationen 1.1–1.8 ✅)

---

## 1. Ziel

Phase 2 erweitert den in Phase 1 aufgebauten Generator um vier neue Fähigkeiten:

| Feature | Beschreibung |
|---|---|
| Stereotype-Tags | Optionale `<<tag>>`-Annotation an `class` / `datatype` in der Grammatik |
| Stereotype-basierte Übersteuerung | Generator-Konventionen per Stereotype gezielt überschreiben |
| DTO-Generator | Java-Records aus `Operation`-Parametern und aus `dto`-Packages |
| Service-Gerüste | `@Service`-Klassen aus `Interface`-Elementen mit Operationen |
| Inheritance-Strategie | `@Inheritance(strategy=…)` via Stereotype |
| Validator-Warnungen | DSL-Warnung bei implizitem `@ManyToOne` (Class-Eigenschaft ohne explizite `assoc`) |

---

## 2. Getroffene Entscheidungen Phase 2

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Stereotype-Syntax | `<<stereotypeName>>` direkt vor dem Typ-Keyword (analog UML-Notation): `<<dto>> datatype Foo {}` |
| 2 | Erlaubte Stereotype | `entity`, `mappedsuperclass`, `embeddable`, `service`, `repository`, `dto`, `request`, `response`, `ignore` |
| 3 | DTO-Ansatz | **Ansatz B** (dediziertes `dto`-Package) als primärer Weg; Ansatz A (aus Operationen) als ergänzende Option |
| 4 | Record vs. Klasse | DTOs werden als Java-Records generiert (Java 16+, kein JPA) |
| 5 | Service-Gerüst | Interface mit Operationen → `@Service public class <Name>Impl implements <Name>` mit leeren Methodenrümpfen |
| 6 | Inheritance-Strategien | `SINGLE_TABLE` und `JOINED` unterstützt; `TABLE_PER_CLASS` als Phase-3-Feature |
| 7 | Validator-Warnungen | Neue `warning`-Checks im bestehenden `ClassDiagramValidator` |
| 8 | Rückwärtskompatibilität | Grammatikerweiterung ist rein optional; alle bestehenden `.cdiag`-Dateien bleiben gültig |

---

## 3. Grammatikerweiterung (Übersicht)

### 3.1 Warum nicht `<<Stereotype>>`?

Die UML-Notation `<<entity>>` scheidet aus, weil das Terminal

```langium
terminal IMPL_BODY: /<<[\s\S]*?>>/;
```

bereits `<<` und `>>` als Teil seines Patterns nutzt. Der Lexer (Chevrotain) ist **kontextfrei**: Er sieht `<<entity>>` und matcht es sofort als `IMPL_BODY`-Token, unabhängig davon, wo im Satz die Stelle steht. First/First-Konflikte im eigentlichen Sinne (Parser-Ebene) wären gar nicht das Problem – die Buchstabenfolge käme beim Parser nie an. Es würde ein Lexer-Fehler auftreten oder `IMPL_BODY` würde fälschlich als Stereotype-Bezeichner durchgehen.

### 3.2 Gewählte Syntax: Java-Annotation-Stil `@stereotypeName`

Das `@`-Zeichen wird in der Grammatik aktuell **nirgendwo** verwendet und kollidiert mit keinem bestehenden Token. Die Erweiterung ist rein additiv:

```langium
terminal STEREOTYPE: /@(entity|mappedsuperclass|embeddable|service|dto|request|response|ignore|joined)/;

// Vorher:
Class returns Type:
    {infer Class} (vis=VisibilityKind)? (abstract?='abstract')? 'class' name=ID ...

// Nachher:
Class returns Type:
    {infer Class} (vis=VisibilityKind)? (abstract?='abstract')?
    (stereotype=STEREOTYPE)?
    'class' name=ID ...
```

Analoges Vorgehen für `DataType` und `Interface`.

Beispiele in der DSL:

```cdiag
@entity abstract class BaseEntity {}
@dto datatype CreateOrderRequest { name : String }
@ignore class InternalHelper {}
@joined abstract class Vehicle {}
```

Die Änderung ist **rein additiv** und **rückwärtskompatibel**: Alle bestehenden `.cdiag`-Dateien ohne Stereotype bleiben unverändert gültig.

---

## 4. Stereotype → Generator-Mapping

| Stereotype | Angewendet auf | Generatorverhalten |
|---|---|---|
| `@entity` | `abstract class` | Erzwingt `@Entity` statt `@MappedSuperclass`; `@Inheritance(strategy=SINGLE_TABLE)` als Default |
| `@mappedsuperclass` | `class` | Erzwingt `@MappedSuperclass` auch für konkrete Klassen |
| `@embeddable` | `class` | Erzeugt `@Embeddable`-Klasse statt `@Entity` (kein Repository) |
| `@service` | `class` | Erzeugt `@Service`-Klasse statt `@Entity` (kein Repository, kein `@Table`) |
| `@dto` | `datatype` / `class` | Erzeugt Java-Record, kein JPA; Ausgabe in `dto/`-Ordner |
| `@request` | `datatype` | Wie `@dto`, Dateiname bleibt `<Name>.java` |
| `@response` | `datatype` | Wie `@dto`, Dateiname bleibt `<Name>.java` |
| `@ignore` | `class` / `datatype` | Kein Code generiert |
| `@joined` | `abstract class` | Wie `@entity`, aber `@Inheritance(strategy=JOINED)` |

---

## 5. DTO-Generator (Ansatz B)

```cdiag
package com.example {
    package dto {
        @dto datatype CreateOrderRequest {
            items  : Item
            qty    : Integer
        }
        @response datatype CreateOrderResponse {
            orderId : Long
            status  : String
        }
    }
}
```

Erzeugte Ausgabe:
```java
// com/example/dto/CreateOrderRequest.java
package com.example.dto;

public record CreateOrderRequest(Item items, Integer qty) {}
```

Regeln:
- Kein `@Embeddable`, keine JPA-Imports
- Felder vom Typ `List<T>` wenn `upper > 1`
- Ausgabepfad: `<dest>/<qualifiedPkg>/dto/<Name>.java`
- Package-Deklaration entsprechend ohne `.domain`-Suffix

---

## 6. Service-Generator

```cdiag
package com.example {
    interface OrderService {
        createOrder(request : CreateOrderRequest) : Order { spec "Legt eine neue Bestellung an" }
        cancelOrder(id : Long) {}
    }
}
```

Erzeugte Ausgaben:
```java
// com/example/service/OrderServiceImpl.java
package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class OrderServiceImpl implements OrderService {

    @Override
    public Order createOrder(CreateOrderRequest request) {
        // spec: Legt eine neue Bestellung an
        throw new UnsupportedOperationException("Not yet implemented");
    }

    @Override
    public void cancelOrder(Long id) {
        throw new UnsupportedOperationException("Not yet implemented");
    }
}
```

Regeln:
- `Interface` mit mindestens einer `Operation` → Service-Gerüst
- Interface ohne Operationen → kein Service generiert
- Rückgabetyp fehlt → `void`
- Parameter-Namen und -Typen aus dem Modell übernommen
- Hat eine Operation `spec`-Beschreibung → als `// spec:…`-Kommentar eingefügt
- Ausgabe in `<dest>/<qualifiedPkg>/service/<Name>Impl.java`

---

## 7. Validator-Warnungen (neue Checks)

Neue Checks im bestehenden `ClassDiagramValidator` (`src/language/class-diagram-validator.ts`):

| Check | Auslöser | Meldung |
|---|---|---|
| `checkImplicitManyToOne` | `Property` bei deren `type.ref.$type === 'Class'` und kein `assoc` im Modell die beide Typen verbindet | `warning`: _"Property '<name>' references class '<Type>' without an explicit association. Consider adding an 'assoc' block (implicit @ManyToOne will be generated)."_ |
| `checkDtoPackageConvention` | `DataType` in einem Package namens `dto`, `request` oder `response` ohne `@dto`/`@request`/`@response`-Stereotype | `hint`: _"DataType in a 'dto'-named package should carry a @dto stereotype for clarity."_ |
| `checkServiceInterfaceConvention` | `Interface` mit Operationen in einem Package namens `service` | `hint`: _"Interface in a 'service' package – consider adding a @service stereotype."_ |

---

## 8. Detaillierte Iterationen

Jede Iteration ist **eigenständig testbar** und endet mit grünem Build.
Abhängigkeitskette: 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8

---

### Iteration 2.1 – Grammatikerweiterung: STEREOTYPE-Terminal
**Ziel:** `@stereotypeName`-Präfix in Grammatik und AST-Typen – **kein Generator-Code**, nur Parsing.

- [ ] `terminal STEREOTYPE` in `class-diagram.langium` definieren:
  `/@(entity|mappedsuperclass|embeddable|service|dto|request|response|ignore|joined)/`
- [ ] `(stereotype=STEREOTYPE)?` optional in `Class`, `DataType`, `Interface` einfügen
- [ ] `npm run langium:generate` → AST-Typen neu generieren, Build grün
- [ ] Alle bestehenden `parsing.test.ts`-Tests weiterhin grün (Rückwärtskompatibilität)
- [ ] Neue Unit-Tests in `test/parsing/parsing.test.ts`:
  - `@dto datatype Foo {}` → `foo.stereotype === '@dto'`
  - `class Bar {}` ohne Stereotype → `bar.stereotype === undefined`
  - `@joined abstract class Base {}` → `base.stereotype === '@joined'`
  - `@ignore class Helper {}` → korrekt geparst

---

### Iteration 2.2 – Stereotype: @ignore und @mappedsuperclass
**Ziel:** Die zwei einfachsten Dispatcher-Fälle, kein neuer Ausgabe-Generator nötig.

- [ ] Hilfsfunktion `getStereotype(node: Class | DataType | Interface): string | undefined` in `generatorSpring.ts`
- [ ] In `generateSpringCode`-Dispatch:
  - `@ignore` auf `Class` oder `DataType` → keine Ausgabe, kein Repository
  - `@mappedsuperclass` auf konkreter `Class` → `generateJpaEntity` erzeugt `@MappedSuperclass` statt `@Entity`, kein Repository
- [ ] Unit-Tests:
  - `@ignore class Foo {}` → keine Datei unter `domain/` erzeugt
  - `@ignore datatype Bar {}` → keine Datei erzeugt
  - `@mappedsuperclass class Baz {}` → Ausgabe enthält `@MappedSuperclass`, **nicht** `@Entity`
  - `@mappedsuperclass class Baz {}` → kein Repository-File generiert

---

### Iteration 2.3 – Stereotype: @entity und @joined (Inheritance-Strategie)
**Ziel:** Abstrakte Klassen können per Stereotype explizit als `@Entity` mit Vererbungsstrategie markiert werden.

- [ ] In `generateJpaEntity`: Stereotype-Prüfung für die Klassen-Annotation:
  - `abstract` + kein Stereotype → `@MappedSuperclass` (unverändert, Phase-1-Verhalten)
  - `abstract` + `@entity` → `@Entity\n@Inheritance(strategy = InheritanceType.SINGLE_TABLE)\n@Table(…)`
  - `abstract` + `@joined` → `@Entity\n@Inheritance(strategy = InheritanceType.JOINED)\n@Table(…)`
- [ ] Import `jakarta.persistence.Inheritance` und `jakarta.persistence.InheritanceType` bedingt ergänzen
- [ ] Für `@entity`- und `@joined`-abstrakte Klassen: Repository **wird** generiert (es ist eine echte Entity)
- [ ] Unit-Tests:
  - `abstract @entity class Base {}` → enthält `@Entity`, `@Inheritance(strategy = InheritanceType.SINGLE_TABLE)`, kein `@MappedSuperclass`
  - `abstract @joined class Base {}` → enthält `@Entity`, `@Inheritance(strategy = InheritanceType.JOINED)`
  - `abstract @entity class Base {}` → Repository-Datei wird erzeugt
  - `abstract class Base {}` (kein Stereotype) → weiterhin `@MappedSuperclass`, kein Repository (Regression)

---

### Iteration 2.4 – Stereotype: @embeddable auf Class
**Ziel:** Eine `class` kann explizit als `@Embeddable` annotiert werden (ohne `datatype` nutzen zu müssen).

- [ ] In `generateSpringCode`-Dispatch:
  - `@embeddable` auf `Class` → `generateEmbeddable` aufrufen statt `generateJpaEntity`
  - Kein Repository für `@embeddable`-Classes
- [ ] `generateEmbeddable` akzeptiert `Class` als Eingabe (bisher nur `DataType`) – Union-Typ oder Overload
- [ ] Unit-Tests:
  - `@embeddable class Address { street : String }` → Ausgabe enthält `@Embeddable`, kein `@Entity`
  - `@embeddable class Address {}` → kein Repository-File
  - Ausgabe liegt in `domain/Address.java` (gleiches Verzeichnis wie `DataType`-Embeddables)

---

### Iteration 2.5 – DTO-Generator (@dto / @request / @response + Package-Konvention)
**Ziel:** DTOs als Java-Records generieren – via Stereotype oder via Package-Name-Konvention.

- [ ] Funktion `generateDto(type: DataType | Class, filePath: string, destination: string | undefined): string` implementieren
- [ ] Ausgabepfad: `<dest>/<qualifiedPkg>/dto/<Name>.java`
- [ ] Package-Deklaration: `<qualifiedPkg>.dto` (kein `.domain`-Suffix)
- [ ] Java-Record-Ausgabe: `public record <Name>(<params>) {}`
  - Parameter aus `properties`: `<JavaType> <name>`, `List<JavaType> <name>` bei `upper > 1`
  - Imports: `java.util.List` falls nötig, `java.time.*` falls nötig, keine JPA-Imports
- [ ] Dispatch in `generateSpringCode`:
  - `DataType` oder `Class` mit Stereotype `@dto`, `@request`, `@response` → `generateDto`
  - `DataType` in einem Package mit Name `dto`, `request` oder `response` (ohne Stereotype) → ebenfalls `generateDto`
  - In beiden Fällen: kein `generateEmbeddable`, kein Repository
- [ ] Export von `generateDto`
- [ ] Unit-Tests:
  - `@dto datatype Req { name : String }` → Record-Datei, `public record Req(String name) {}`
  - `@response datatype Res { id : Long  items : Item [0..-1] }` → `List<Item> items`
  - `DataType` in Package `dto` ohne Stereotype → wird als Record generiert
  - Ausgabepfad endet auf `dto/Req.java`
  - Keine JPA-Imports in der Ausgabe

---

### Iteration 2.6 – Service-Generator (Interface → @Service-Impl)
**Ziel:** `Interface` mit `Operation`-Elementen → Spring-`@Service`-Implementierungsklasse.

- [ ] Funktion `generateServiceImpl(iface: Interface, filePath: string, destination: string | undefined): string` implementieren
- [ ] Ausgabepfad: `<dest>/<qualifiedPkg>/service/<Name>Impl.java`
- [ ] Package-Deklaration: `<qualifiedPkg>.service`
- [ ] Klassenrumpf:
  - `import org.springframework.stereotype.Service;`
  - `@Service public class <Name>Impl implements <Name> { … }`
- [ ] Für jede `Operation`:
  - `@Override`
  - Rückgabetyp: `type.ref.name` oder `void` wenn kein Rückgabetyp
  - Parameter aus `params[]`: `<JavaType> <name>`
  - Hat Operation `description` (spec) → `// spec: <description>` als erste Zeile im Body
  - Body: `throw new UnsupportedOperationException("Not yet implemented");`
- [ ] Dispatch in `generateSpringCode`:
  - `Interface` mit mindestens einer Operation → `generateServiceImpl`
  - `Interface` ohne Operationen → kein Output
- [ ] Export von `generateServiceImpl`
- [ ] Unit-Tests:
  - Interface mit 2 Operationen → Impl-Datei mit 2 `@Override`-Methoden
  - Operation mit `spec`-Beschreibung → `// spec:`-Kommentar im Body
  - Operation ohne Rückgabetyp → `void` in der Signatur
  - Interface ohne Operationen → keine Datei erzeugt
  - Ausgabepfad endet auf `service/<Name>Impl.java`

---

### Iteration 2.7 – Validator-Warnungen
**Ziel:** DSL-seitige Hinweise auf potenzielle Modellierungsprobleme direkt im Editor.

- [ ] `checkImplicitManyToOne` in `ClassDiagramValidator` implementieren:
  - Iteriert über alle `Property`-Elemente einer `Class`
  - Bedingung: `p.type?.ref?.$type === 'Class'`
  - Prüfung: Gibt es eine `Association` im selben Modell, die beide Typen verbindet?
    - Hilfsfunktion: `hasCoveringAssoc(model, ownerClass, referencedClass): boolean`
  - Falls nicht → `accept('warning', "Property '${p.name}' …", { node: p, property: 'name' })`
- [ ] `checkDtoPackageConvention` in `ClassDiagramValidator` implementieren:
  - Bedingung: `DataType` in Package mit Namen `dto`, `request` oder `response`
  - Bedingung: Kein `@dto`/`@request`/`@response`-Stereotype
  - → `accept('hint', "DataType in a '${pkg.name}' package …", { node: t, property: 'name' })`
- [ ] Beide Checks in `registerValidationChecks` eintragen
- [ ] Unit-Tests in `test/validating/validating.test.ts`:
  - `Class` mit Direct-Class-Property ohne passende `assoc` → warning
  - `Class` mit Direct-Class-Property **mit** passender `assoc` → keine warning
  - `DataType` in `dto`-Package ohne Stereotype → hint
  - `DataType` in `dto`-Package mit `@dto` → kein hint

---

### Iteration 2.8 – E2E-Tests und Konsolidierung Phase 2
**Ziel:** Vollständige Abdeckung aller Phase-2-Features in Kombination; Regressionssicherung.

- [ ] E2E-Test in `test/generation/springgen.test.ts`:
  - Vollständiges Modell mit: `@joined abstract class`, konkreter Subklasse, `@dto datatype`, `@response datatype`, Interface mit Operationen, `@ignore class`
  - Prüfen: alle erwarteten Dateien vorhanden und korrekt; `@ignore`-Klasse fehlt
- [ ] E2E-Test für Package-Konvention: `dto`-Package ohne Stereotype → Records generiert
- [ ] E2E-Test für Validator (in `validating.test.ts`): implizites `@ManyToOne` ist im Modell mit `assoc` abgedeckt → keine warning
- [ ] Sicherstellen, dass alle Phase-1-Tests (60 springgen + andere) weiterhin grün sind
- [ ] Beispieldatei `test/sample-phase2.cdiag` anlegen (Inhalt wie Abschnitt 10 dieses Plans)

---

## 9. Neue Dateien und Änderungen nach Phase 2

```
src/language/
  class-diagram.langium          (erweitert: StereotypeName-Regel, optionale <<>> in Class/DataType/Interface)
  class-diagram-validator.ts     (erweitert: 3 neue Checks)
  generated/
    ast.ts                       (neu generiert: stereotype?-Felder in Class, DataType, Interface)
    grammar.ts                   (neu generiert)

src/cli/
  generatorSpring.ts             (erweitert: Stereotype-Dispatcher, generateDto, generateServiceImpl)

test/
  generation/
    springgen.test.ts            (erweitert: Phase-2-Tests)
  validating/
    validating.test.ts           (erweitert: neue Validator-Tests)
  sample-phase2.cdiag            (NEU: Beispielmodell für manuelle Smoke-Tests)
```

---

## 10. Beispiel-Eingabe Phase 2

```cdiag
package com {
    package example {

        primitive Long
        primitive String
        primitive Integer

        // --- Domain ---
        @joined abstract class BaseEntity {}

        class Customer extends BaseEntity {
            name  : String
            email : String
        }

        class PremiumCustomer extends Customer {
            creditLimit : Integer
        }

        // --- DTO ---
        package dto {
            @dto datatype CreateCustomerRequest {
                name  : String
                email : String
            }
            @response datatype CustomerResponse {
                id    : Long
                name  : String
                email : String
            }
        }

        // --- Service ---
        interface CustomerService {
            createCustomer(request : CreateCustomerRequest) : Customer {
                spec "Legt einen neuen Kunden an"
            }
            findById(id : Long) : Customer {}
        }

        // --- Ignoriert ---
        @ignore class InternalHelper {}
    }
}
```

### Erwartete Ausgaben

```
generated/
  com/example/
    domain/
      BaseEntity.java          (@Entity @Inheritance(strategy=JOINED) @Table …)
      Customer.java            (@Entity extends BaseEntity …)
      PremiumCustomer.java     (@Entity extends Customer …)
    dto/
      CreateCustomerRequest.java   (record CreateCustomerRequest(String name, String email) {})
      CustomerResponse.java        (record CustomerResponse(Long id, String name, String email) {})
    repository/
      CustomerRepository.java
      PremiumCustomerRepository.java
    service/
      CustomerServiceImpl.java     (@Service public class CustomerServiceImpl implements CustomerService …)
    // InternalHelper.java → NICHT erzeugt (<<ignore>>)
```
