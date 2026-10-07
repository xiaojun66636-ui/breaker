# breaker

Circuit breaker. No dependencies.

Closed calls go through. Consecutive failures open the circuit, and further calls fail fast with `CircuitOpenError` instead of hitting a dead dependency. After `resetMs`, the next call is a single half-open probe. Success closes the circuit. Failure opens it again. A second caller during that probe also fails fast.

Pass `now` from tests. Do not sleep.

## Use

```ts
import { CircuitBreaker } from "./src/breaker.ts";

const breaker = new CircuitBreaker({ failureThreshold: 5, resetMs: 10_000 });
await breaker.execute(() => fetch(url));
```

This does not retry. Pair it with a backoff policy if a failed probe should be tried again later. It also does not classify errors: every throw counts. Wrap `execute` if a 400 should not open the circuit.

## Test

```bash
node --experimental-strip-types --test test/*.test.ts
```

## License

MIT
