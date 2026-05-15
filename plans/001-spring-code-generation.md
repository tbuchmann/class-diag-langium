# Plan 001 – Spring Boot / JPA Code Generator

> **Status:** Entscheidungen getroffen, Phase 1 in Iterationen aufgeteilt (Stand: April 2026)

## 1. Ziel

Erweiterung des Generators um einen vollständigen **Spring Boot / JPA-Codegenerator**, der aus dem bestehenden Klassendiagramm-Modell folgende Artefakte erzeugt:

| Artefakt | Quelle im Modell | Zielverzeichnis |
|---|---|---|
| JPA-Entity-Klassen | `Class` | `<dest>/<pkg>/domain/` |
| Embeddable-Klassen | `DataType` | `<dest>/<pkg>/domain/` |
| Enumerationen (JPA-kompatibel) | `Enumeration` | `<dest>/<pkg>/domain/` |
| Spring Data Repositories | `Class` (Entity) | `<dest>/<pkg>/repository/` |
| Request-/Response-DTOs | Operationen mit Parametern | `<dest>/<pkg>/dto/` |

---

## 2. Analyse des bestehenden Modells

### 2.1 Verwendete Grammatik-Elemente

Die Sprache (`class-diagram.langium`) stellt folgende Elemente bereit, die für JPA relevant sind:

| Grammatikelement | JPA-Bedeutung |
|---|---|
| `Class` | `@Entity` – persistente Domänenklasse |
| `abstract Class` | abstrakte Basisentität (`@MappedSuperclass`) |
| `DataType` | `@Embeddable` – Value Object / Embedded Type |
| `PrimitiveType` | Mapping auf Java-Basistypen (String, Integer, …) |
| `Enumeration` | `enum` + `@Enumerated(EnumType.STRING)` |
| `Interface` | Interface (kein JPA) |
| `Association` mit `composite` | `@OneToOne @Embedded` oder `@OneToMany … cascade=ALL` |
| `Association` mit `shared` | `@ManyToOne` / `@OneToMany` / `@ManyToMany` |
| `Association` mit `none` | einfache Referenz ohne explizite Komposition |
| Kardinalität `lower`/`upper` | bestimmt Beziehungstyp (`One`/`Many`) |
| `AggregationKind` (`none`\|`shared`\|`composite`) | bestimmt Cascade-Verhalten |
| `Property.notnavigable` | steuert, ob Rückrichtung generiert wird |
| `Operation` mit `spec` (description) | Hinweis auf Repository-Methoden oder DTO-Bedarf |

### 2.2 Einschränkungen des aktuellen Modells

Das Modell enthält keine expliziten Stereotypen (z. B. `<<entity>>`, `<<service>>`, `<<dto>>`). Es gibt daher Konventionsbedarf:

- **Jede nicht-abstrakte `Class`** wird standardmäßig als Entity behandelt.
- **`DataType`** → immer `@Embeddable`.
- **`Interface`** → bleibt Interface, keine JPA-Annotation.
- **Abstrakte Klassen** → `@MappedSuperclass`.
- Es wird davon ausgegangen, dass jede Entity ein synthetisches `id`-Feld vom Typ `Long` erhält, wenn kein Property mit dem Namen `id` vorhanden ist.

---

## 3. Optionale Grammatikerweiterung (Stereotype-Tags)

Um feinere Kontrolle zu ermöglichen, kann die Grammatik um optionale Tags erweitert werden – **nicht zwingend für Phase 1**:

```langium
Class returns Type:
    {infer Class} (vis=VisibilityKind)?
    (stereotype='<<' stereotypeName=ID '>>')?   // NEU
    (abstract?='abstract')? 'class' name=ID ...
```

Mögliche Stereotype: `entity`, `mappedsuperclass`, `embeddable`, `service`, `repository`, `dto`, `request`, `response`.

Diese Erweiterung erlaubt gezielte Überschreibung der Standardkonventionen. **Sie ist als Phase-2-Feature eingeplant.**

---

## 4. Mapping-Regeln

### 4.1 Typen-Mapping (PrimitiveType → Java/JPA)

| Modell-Typ | Java-Typ | JPA-Besonderheit |
|---|---|---|
| `String` | `String` | `@Column` ggf. mit `length` |
| `Integer` | `Integer` | – |
| `Boolean` | `Boolean` | – |
| `Decimal` | `Double` | – |
| `Date` | `LocalDate` | `@Temporal` entfällt in neuerem JPA |
| `DateTime` | `LocalDateTime` | – |
| `Long` | `Long` | für IDs |

### 4.2 Assoziationen → JPA-Beziehungen

| Kardinalität Quelle | Kardinalität Ziel | AggregationKind | JPA-Annotation |
|---|---|---|---|
| `1` | `1` | `composite` | `@OneToOne(cascade=CascadeType.ALL)` / `@Embedded` |
| `1` | `1` | `shared`/`none` | `@OneToOne` |
| `1` | `*` | `composite` | `@OneToMany(cascade=CascadeType.ALL, orphanRemoval=true)` |
| `1` | `*` | `shared`/`none` | `@OneToMany` |
| `*` | `1` | beliebig | `@ManyToOne` (Besitzer) |
| `*` | `*` | beliebig | `@ManyToMany` |

- Besitzerseite (`@JoinColumn` / `@JoinTable`): die Seite mit `upper == 1` oder die Seite mit kleinerer Kardinalität.
- Umkehrseite: `mappedBy`-Attribut aus dem Property-Namen der Besitzerseite.
- `notnavigable`-Flag (`x` in der Syntax) → kein Feld auf dieser Seite generieren.
- **Beide Seiten einer Assoziation werden immer generiert** (bidirektional), **außer** eine Seite ist mit `x` (`notnavigable`) markiert.
- Die Umkehrseite (`mappedBy`-Seite) erhält zusätzlich `@JsonIgnore` (aus `com.fasterxml.jackson.annotation`), um zirkuläre Serialisierung zu verhindern.

### 4.3 DataType → @Embeddable

```java
@Embeddable
public class Address {
    private String street;
    private String city;
}
```

In der besitzenden Entity: `@Embedded private Address address;`

---

## 5. Zu generierende Artefakte im Detail

### 5.1 JPA Entity

```java
package com.example.domain;

import jakarta.persistence.*;
import java.util.List;
import java.util.ArrayList;

@Entity
@Table(name = "customer")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @OneToMany(mappedBy = "customer", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Order> orders = new ArrayList<>();

    // Getter / Setter
}
```

Regeln:
- `@Entity` auf non-abstract Classes.
- `@MappedSuperclass` auf abstract Classes (keine eigene Tabelle; Phase 2: opt-in zu `@Entity` + `@Inheritance` via Stereotype).
- Automatisch generiertes `id`-Feld (`Long`, `@Id`, `@GeneratedValue(strategy = GenerationType.IDENTITY)`), es sei denn, ein Property mit dem Namen `id` existiert bereits – dieses wird dann direkt als `@Id` verwendet.
- `@Table(name = "<snake_case_classname>")` generieren (Konvention: `CustomerOrder` → `customer_order`).
- Getter/Setter vollständig generiert (kein Lombok).
- Properties vom Typ einer anderen `Class` ohne explizite Assoziation erhalten `@ManyToOne` sowie einen generierten Kommentar `// WARN: implicit @ManyToOne – consider modeling an explicit assoc`. Eine entsprechende Warnung wird auch im Langium-Validator ergänzt (separates Issue).

### 5.2 Spring Data Repository

```java
package com.example.repository;

import com.example.domain.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {
    // generierte Finder aus Operationen mit spec-Kommentar
    // List<Customer> findByName(String name);
}
```

Regeln:
- Für jede `@Entity`-Klasse genau ein Repository-Interface.
- Basis-Interface: **`JpaRepository<T, Long>`** (beinhaltet `CrudRepository`, Paginierung, Sortierung).
- ID-Typ ist `Long` (entspricht dem synthetisch generierten bzw. dem expliziten `id`-Property).
- Finder-Methoden: Aus `Operation`s mit `spec`-Beschreibung (`@prompt`-Content) ableiten. Falls die Operation einen Rückgabetyp hat, der der Entity entspricht, wird `findBy…` generiert.

### 5.3 DTO-Klassen

Zwei Ansätze werden unterstützt:

**Ansatz A – Konvention über Operationen:**
- Jede `Operation` auf einer Entity-Klasse, die Parameter hat → generiere einen `<OperationName>Request`-Record.
- Hat eine Operation einen Rückgabewert → generiere einen `<OperationName>Response`-Record.

**Ansatz B – Dedizierte `DataType`-Packages (bevorzugt für Phase 2):**
- Ein Package mit dem Namen `dto` (oder `request`/`response`) führt dazu, dass seine `DataType`-Elemente als Java-Records generiert werden.
- Kein JPA – kein `@Embeddable`, stattdessen plain Java record.

Beispiel (Ansatz A):

```java
// aus: createOrder(item: Item, qty: Integer) : Order { spec "Create a new order" }
public record CreateOrderRequest(Item item, Integer qty) {}
public record CreateOrderResponse(Long orderId, String status) {}
```

---

## 6. Getroffene Entscheidungen

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Repository-Basis-Interface | **`JpaRepository<T, Long>`** (beinhaltet Paginierung/Sortierung ohne Zusatzaufwand) |
| 2 | ID-Typ | **`Long`** als Default; wird überschrieben, falls ein Property `id` im Modell vorhanden ist |
| 3 | Bidirektionale Assoziationen | **Immer beide Seiten generieren**, außer `notnavigable` (`x`) gesetzt; Umkehrseite erhält `@JsonIgnore` |
| 4 | `@Table`-Name | **snake_case** (Spring-Konvention, z. B. `CustomerOrder` → `customer_order`) |
| 5 | Abstrakte Klasse | **`@MappedSuperclass`** als Default; `@Entity` + `@Inheritance` als Phase-2-Feature via Stereotype |
| 6 | Property vom Typ einer anderen Class ohne Assoc | **`@ManyToOne` + Warn-Kommentar** im Code; Validator-Warnung in der DSL folgt separat |
| 7 | Lombok | **Kein Lombok** – Getter/Setter werden explizit generiert; sauberer beim Testen, keine Zusatzabhängigkeit |

---

## 7. Implementierungsplan Phase 1 – Detaillierte Iterationen

Phase 1 zielt auf einen vollständig lauffähigen Generator für Entities, Embeddables, Enumerationen und Repositories.
Jede Iteration ist eigenständig testbar und endet mit kompilierfähigem Output.

---

### Iteration 1.1 – Grundgerüst und Typ-Mapping
**Ziel:** Neue Datei `src/cli/spring-generator.ts` mit Einstiegspunkt und Typ-Mapping.

- [ ] Neue Datei `src/cli/generatorSpring.ts` anlegen (Namenskonvention analog zu `generator.ts`)
- [ ] Einstiegsfunktion `generateSpringCode(model, filePath, destination)` exportieren
- [ ] Hilfsfunktion `toSnakeCase(name: string): string` implementieren
- [ ] Typ-Mapping-Tabelle `springTypeMap` definieren:

| Modell-Typ | Java-Typ |
|---|---|
| `String` | `String` |
| `Integer` | `Integer` |
| `Boolean` | `Boolean` |
| `Decimal` | `Double` |
| `Long` | `Long` |
| `Date` | `LocalDate` |
| `DateTime` | `LocalDateTime` |

- [ ] Hilfsfunktion `printSpringType(t: TypedElement): string` (analog zu bestehendem `printType`, mit erweitertem Mapping)
- [ ] Integrations-Smoke-Test: `generateSpringCode` auf leerem Modell aufrufen → kein Fehler

---

### Iteration 1.2 – Enum-Generator
**Ziel:** `Enumeration` → JPA-kompatibles Java-Enum.

- [ ] Funktion `generateJpaEnum(type: Enumeration, filePath, destination)` implementieren
- [ ] Ausgabe in `<dest>/<qualifiedPkg>/domain/<Name>.java`
- [ ] Kein Unterschied zum bestehenden `generateJavaEnum` – jedoch Zielverzeichnis `domain/` statt Paket-Pfad direkt
- [ ] Keine JPA-Annotation nötig; Enums werden in Entities über `@Enumerated(EnumType.STRING)` referenziert
- [ ] Unit-Test: `Enumeration` mit 3 Literals → korrekte `.java`-Datei

---

### Iteration 1.3 – Embeddable-Generator
**Ziel:** `DataType` → `@Embeddable`-Klasse.

- [ ] Funktion `generateEmbeddable(type: DataType, filePath, destination)` implementieren
- [ ] `@Embeddable` auf der Klasse
- [ ] Properties → `@Column`-annotierte private Felder
- [ ] Getter/Setter für alle Properties
- [ ] Import-Block: `jakarta.persistence.*`
- [ ] Ausgabe in `<dest>/<qualifiedPkg>/domain/<Name>.java`
- [ ] Unit-Test: `DataType` mit 2 Properties → `@Embeddable`-Klasse mit Feldern und Accessoren

---

### Iteration 1.4 – Entity-Generator (Properties, ohne Assoziationen)
**Ziel:** Vollständige JPA-Entity-Klasse für `Class`, zunächst ohne Assoziations-Handling.

- [ ] Funktion `generateJpaEntity(clz: Class, filePath, destination)` implementieren
- [ ] `@Entity` / `@MappedSuperclass` je nach `clz.abstract`
- [ ] `@Table(name = toSnakeCase(clz.name))`
- [ ] Automatisches `id`-Feld (`@Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id`), wenn kein Property `id` vorhanden
- [ ] Properties → annotierte Felder:
  - PrimitiveType-Property → `@Column private <javaType> <name>;`
  - DataType-Property → `@Embedded private <DataType> <name>;`
  - Enumeration-Property → `@Enumerated(EnumType.STRING) @Column private <Enum> <name>;`
  - Class-Property (ohne Assoc) → `@ManyToOne private <Class> <name>; // WARN: implicit @ManyToOne`
- [ ] Getter/Setter für alle Properties
- [ ] Import-Block: `jakarta.persistence.*`, `java.time.*` (bedingt), `java.util.*` (bedingt)
- [ ] Ausgabe in `<dest>/<qualifiedPkg>/domain/<Name>.java`
- [ ] Unit-Tests:
  - Entity mit PrimitiveType-Properties → `@Column`-Felder korrekt
  - Abstrakte Entity → `@MappedSuperclass`
  - Property `id` vorhanden → kein doppeltes `id`-Feld
  - DataType-Property → `@Embedded`
  - Enumeration-Property → `@Enumerated(EnumType.STRING)`
  - Class-Property ohne Assoc → `@ManyToOne` + Warn-Kommentar

---

### Iteration 1.5 – Entity-Generator (Assoziationen)
**Ziel:** Assoziationen korrekt als JPA-Beziehungsannotationen generieren.

- [ ] Assoziationen aus Modell sammeln (analog zu `collectAllAssociations` in `generator.ts`)
- [ ] Besitzerseite bestimmen (Seite mit `upper == 1`; bei `*:*` per Konvention die erste Property)
- [ ] Für jede Assoziation die zugehörige Property in der Entity generieren:
  - `@ManyToOne @JoinColumn` auf Besitzerseite
  - `@OneToMany(mappedBy="<prop>")` auf Umkehrseite + `@JsonIgnore`
  - `@OneToOne` / `@OneToOne(mappedBy="<prop>")` analog
  - `@ManyToMany @JoinTable` / `@ManyToMany(mappedBy="<prop>")` analog
  - Cascade je nach `AggregationKind` (`composite` → `CascadeType.ALL, orphanRemoval=true`)
- [ ] `notnavigable`-Flag → Seite wird **nicht** generiert
- [ ] Felder mit `upper > 1` → `List<T>` initialisiert mit `new ArrayList<>()`
- [ ] Getter/Setter für Assoziationsfelder ebenfalls generieren
- [ ] Import-Block um `com.fasterxml.jackson.annotation.JsonIgnore` erweitern (bedingt)
- [ ] Unit-Tests:
  - `1:*` composite → `@OneToMany(cascade=ALL, orphanRemoval=true)` + `@JsonIgnore` auf Umkehrseite
  - `*:1` shared → `@ManyToOne` + `@OneToMany(mappedBy=…)`
  - `*:*` → `@ManyToMany` + `@ManyToMany(mappedBy=…)` + `@JsonIgnore`
  - `notnavigable` → nur eine Seite generiert
  - `1:1` composite → `@OneToOne(cascade=ALL)` + `@JsonIgnore`

---

### Iteration 1.6 – Repository-Generator
**Ziel:** Spring Data `JpaRepository`-Interface für jede Entity.

- [ ] Funktion `generateSpringRepository(clz: Class, filePath, destination)` implementieren
- [ ] Nur für nicht-abstrakte Classes (Entities)
- [ ] `@Repository public interface <Name>Repository extends JpaRepository<<Name>, Long>`
- [ ] Aus `Operation`s mit `spec`-Beschreibung: auskommentierte `findBy`-Methodensignaturen als Hinweis einfügen
- [ ] Ausgabe in `<dest>/<qualifiedPkg>/repository/<Name>Repository.java`
- [ ] Unit-Tests:
  - Entity ohne Operationen → leeres Repository-Interface korrekt generiert
  - Entity mit spec-Operationen → auskommentierte Finder-Methoden vorhanden

---

### Iteration 1.7 – CLI- und Extension-Integration
**Ziel:** Neuer CLI-Befehl und neues VS Code-Command, analog zum bestehenden `generate`-Befehl / `class-diagram.generate`-Command.

**CLI (`src/cli/main.ts`):**
- [ ] `generateSpringCode` aus `generatorSpring.ts` importieren
- [ ] `generateSpringAction` analog zu `generateAction` implementieren
- [ ] Befehl `generate-spring` registrieren mit Option `-d, --destination <dir>`

**VS Code Extension (`src/extension/main.ts`):**
- [ ] `generateSpringCode` aus `generatorSpring.ts` importieren
- [ ] `generateSpringCodeAction(fileName, destination)` analog zu `generateCodeAction` implementieren (inkl. Java-Formatter-Aufruf)
- [ ] Command `class-diagram.generateSpring` mit `vscode.commands.registerCommand` registrieren
- [ ] In `context.subscriptions` eintragen
- [ ] Die Destination soll eingegeben werden können (in erster Version via Pfadauswahl im Filesystem)

**`package.json`:**
- [ ] Neuen Command-Eintrag unter `contributes.commands` hinzufügen:
  ```json
  {
    "command": "class-diagram.generateSpring",
    "title": "Generate Spring/JPA Code",
    "category": "Class Diagram"
  }
  ```
- [ ] Eintrag im Context-Menü unter `contributes.menus.explorer/context` hinzufügen (analog zu `class-diagram.generate`, `when: resourceExtname == .cdiag`)

**Smoke-Test:**
- [ ] CLI: `node bin/cli.js generate-spring <file.cdiag> -d ./out` auf einer Beispiel-Datei
- [ ] Extension: Command Palette → „Generate Spring/JPA Code" → korrekte Ausgabe in `src/generated/`

---

### Iteration 1.8 – Integrations-Tests und Aufräumen
**Ziel:** Vollständige Testabdeckung für Phase 1 in `test/generation/springgen.test.ts`.

- [ ] Datei `test/generation/springgen.test.ts` anlegen
- [ ] Alle Einzel-Tests aus Iterationen 1.2–1.6 konsolidieren und ergänzen
- [ ] End-to-End-Test mit dem Beispielmodell aus Abschnitt 9
- [ ] Sicherstellen, dass bestehende Tests (`javagen`, `plantuml`, `parsing`, `validating`, `linking`) weiterhin grün sind

---

## 8. Implementierungsplan Phase 2 – DTO-Generator und Stereotype

- [ ] **2.1** DTO-Generator (Ansatz A: aus Operationen mit Parametern)
- [ ] **2.2** Grammatikerweiterung: optionale Stereotype-Tags (`<<entity>>`, `<<dto>>`, `<<mappedsuperclass>>` etc.)
- [ ] **2.3** Stereotype-basierte Übersteuerung der Konventionen (z. B. `abstract class` explizit als `@Entity`)
- [ ] **2.4** `dto`-Package → DataTypes werden als plain Java Records ohne JPA generiert
- [ ] **2.5** `@Service`-Gerüst aus Interfaces mit Operationen
- [ ] **2.6** `@Inheritance`-Strategie (`JOINED`, `SINGLE_TABLE`) als Stereotype-Option

---

## 9. Implementierungsplan Phase 3 – Qualitätssicherung und Integration

- [ ] **3.1** Vollständige Testabdeckung `test/generation/springgen.test.ts`
- [ ] **3.2** Integration in VS Code-Extension (`src/extension/`)
- [ ] **3.3** README-Abschnitt für den Spring-Generator
- [ ] **3.4** DSL-Validator-Warnung für implizite Class-zu-Class-Properties ohne Assoziation

---

## 10. Dateistruktur nach Phase 1

```
src/cli/
  generator.ts          (bestehend – Java & PlantUML)
  generatorSpring.ts    (NEU)
  main.ts               (erweitert um generate-spring CLI-Befehl)

src/extension/
  main.ts               (erweitert um class-diagram.generateSpring Command)

test/generation/
  javagen.test.ts       (bestehend)
  plantuml.test.ts      (bestehend)
  springgen.test.ts     (NEU)

plans/
  001-spring-code-generation.md  (dieser Plan)
```

Generiertes Beispiel-Ausgabeverzeichnis (für Paket `com.example`):
```
generated/
  com/example/
    domain/
      Customer.java
      Order.java
      Address.java       (@Embeddable)
      OrderStatus.java   (enum)
    repository/
      CustomerRepository.java
      OrderRepository.java
```

---

## 11. Beispiel-Eingabe und erwartete Ausgabe

### Eingabe (`.cdiag`-Datei)

```
package com.example {

    primitive Long
    primitive String
    primitive Integer

    enum OrderStatus {
        PENDING, CONFIRMED, SHIPPED, CANCELLED
    }

    datatype Address {
        street : String
        city   : String
    }

    class Customer {
        name    : String
        email   : String
    }

    class Order {
        status   : OrderStatus
        quantity : Integer
    }

    assoc CustomerOrders {
        customer : Customer [0..1] none
        orders   : Order    [0..*] none
    }
}
```

### Erwartete Entity-Ausgabe: `Customer.java`

```java
package com.example.domain;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.List;
import java.util.ArrayList;

@Entity
@Table(name = "customer")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column
    private String name;

    @Column
    private String email;

    @JsonIgnore
    @OneToMany(mappedBy = "customer")
    private List<Order> orders = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public List<Order> getOrders() { return orders; }
    public void setOrders(List<Order> orders) { this.orders = orders; }
}
```

### Erwartete Entity-Ausgabe: `Order.java`

```java
package com.example.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "order_")   // "order" ist SQL-Keyword → Suffix "_" als Schutz
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column
    private OrderStatus status;

    @Column
    private Integer quantity;

    @ManyToOne
    @JoinColumn(name = "customer_id")
    private Customer customer;

    // Getter / Setter ...
}
```

> **Hinweis:** SQL-reservierte Wörter als Tabellenname (z. B. `order`, `group`, `user`) erhalten automatisch einen Unterstrich-Suffix (`order_`). Dies wird in Iteration 1.1 in `toSnakeCase` behandelt.

### Erwartete Repository-Ausgabe: `CustomerRepository.java`

```java
package com.example.repository;

import com.example.domain.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {
}
```

---

## 12. Abhängigkeiten / pom.xml-Snippet (Hinweis für Nutzer)

Der Generator erzeugt Code, der folgende Spring Boot / JPA Abhängigkeiten voraussetzt:

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-annotations</artifactId>
        <!-- wird transitiv durch spring-boot-starter-web mitgebracht -->
    </dependency>
</dependencies>
```

Der Generator selbst schreibt **kein** `pom.xml`.
