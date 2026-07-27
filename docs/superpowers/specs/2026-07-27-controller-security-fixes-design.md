# Controller & Security Fixes Design

## Problem
Generated controllers have three issues:
1. Path variable mismatch: `@GetMapping("/{id}")` with `@PathVariable Long userId`
2. Wrong HTTP methods: `@PutMapping("/getProductReview/...")` for GET operations
3. No JWT token parsing/validation in SecurityConfig

## Design

### 1. Path Variables
Use actual parameter name in path: `/{userId}` instead of `/{id}`.
Disambiguation: `/{opName}/{paramName}`.

### 2. HTTP Method via DSL Annotation
New `http` clause in grammar:
```
getProductReview(productId : Long, request : GetProductReviewRequest) : ProductReviewSnapshot {
    http GET
    spec "..."
}
```

Logic:
- If `http` specified: use that method
- If not: prefix-based inference for CRUD (`get*`/`find*` → GET, `add*`/`create*`/`register*` → POST, `delete*`/`remove*` → DELETE, `update*`/`edit*`/`change*`/`set*` → PUT)
- Default: POST

### 3. Security
- `SecurityConfig.java` — Basic Auth default, JWT filter activatable
- `JwtTokenProvider.java` — JWT generate/validate with configurable secret
- `JwtAuthenticationFilter.java` — parse `Authorization: Bearer` header, validate, set SecurityContext

## Files
- `src/language/class-diagram.langium` — add `http` clause
- `src/cli/generatorController.ts` — fix path variables, use `http` annotation
- `src/cli/generatorSpring.ts` — generate SecurityConfig, JwtTokenProvider, JwtAuthenticationFilter
- `examples/iced-latte.cdiag` — add `http` annotations to non-CRUD operations
- `test/generation/springgen.test.ts` — update tests
