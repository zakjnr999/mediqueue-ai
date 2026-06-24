import { test } from "node:test";
import assert from "node:assert/strict";

// Helper checking state transitions
function validateStatusTransition(currentStatus, targetStatus) {
  const allowedTransitions = {
    WAITING: ["IN_PROGRESS"],
    IN_PROGRESS: ["COMPLETED"],
    COMPLETED: [],
  };

  if (!allowedTransitions[currentStatus]) {
    return { valid: false, error: "Invalid current status." };
  }

  if (!allowedTransitions[currentStatus].includes(targetStatus)) {
    return {
      valid: false,
      error: `Cannot transition status from ${currentStatus} to ${targetStatus}.`,
    };
  }

  return { valid: true };
}

test("Status Transition: WAITING to IN_PROGRESS", () => {
  const result = validateStatusTransition("WAITING", "IN_PROGRESS");
  assert.equal(result.valid, true);
});

test("Status Transition: IN_PROGRESS to COMPLETED", () => {
  const result = validateStatusTransition("IN_PROGRESS", "COMPLETED");
  assert.equal(result.valid, true);
});

test("Status Transition: Block WAITING to COMPLETED", () => {
  const result = validateStatusTransition("WAITING", "COMPLETED");
  assert.equal(result.valid, false);
  assert.match(result.error, /Cannot transition status/);
});

test("Status Transition: Block Backward Transitions", () => {
  const result = validateStatusTransition("IN_PROGRESS", "WAITING");
  assert.equal(result.valid, false);
  assert.match(result.error, /Cannot transition status/);
});

test("Status Transition: Block Completed Transitions", () => {
  const result = validateStatusTransition("COMPLETED", "IN_PROGRESS");
  assert.equal(result.valid, false);
  assert.match(result.error, /Cannot transition status/);
});
