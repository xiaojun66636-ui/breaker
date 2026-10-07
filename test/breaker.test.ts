import assert from "node:assert/strict";
import { test } from "node:test";
import { CircuitBreaker, CircuitOpenError } from "../src/breaker.ts";

test("opens after consecutive failures and fails fast", async () => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    resetMs: 100,
    now: () => clock.t,
  });
  await assert.rejects(() => breaker.execute(() => { throw new Error("down"); }), /down/);
  assert.equal(breaker.state, "closed");
  await assert.rejects(() => breaker.execute(() => { throw new Error("down"); }), /down/);
  assert.equal(breaker.state, "open");
  await assert.rejects(() => breaker.execute(() => "skipped"), CircuitOpenError);
});

test("a success clears the failure streak", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, now: () => 0 });
  await assert.rejects(() => breaker.execute(() => { throw new Error("down"); }));
  assert.equal(await breaker.execute(() => "ok"), "ok");
  await assert.rejects(() => breaker.execute(() => { throw new Error("down"); }));
  assert.equal(breaker.state, "closed");
});

test("half-open allows one probe", async () => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold: 1,
    resetMs: 50,
    now: () => clock.t,
  });
  await assert.rejects(() => breaker.execute(() => { throw new Error("down"); }));
  clock.t = 50;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = breaker.execute(async () => {
    await gate;
    return "back";
  });
  await assert.rejects(() => breaker.execute(() => "second"), CircuitOpenError);
  release();
  assert.equal(await pending, "back");
  assert.equal(breaker.state, "closed");
});

test("a failed probe opens the circuit again", async () => {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({
    failureThreshold: 1,
    resetMs: 10,
    now: () => clock.t,
  });
  await assert.rejects(() => breaker.execute(() => { throw new Error("down"); }));
  clock.t = 10;
  await assert.rejects(() => breaker.execute(() => { throw new Error("still"); }), /still/);
  assert.equal(breaker.state, "open");
  await assert.rejects(() => breaker.execute(() => "no"), CircuitOpenError);
});

test("rejects bad options", () => {
  assert.throws(() => new CircuitBreaker({ failureThreshold: 0 }));
  assert.throws(() => new CircuitBreaker({ resetMs: -1 }));
});
