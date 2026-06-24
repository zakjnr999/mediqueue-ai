import { test } from "node:test";
import assert from "node:assert/strict";

// Helper function that mirrors the frontend validation logic in check-in page
function validateCheckInData(data) {
  const errors = {};

  if (!data.fullName || !data.fullName.trim()) {
    errors.fullName = "Full name is required.";
  } else if (data.fullName.trim().length > 100) {
    errors.fullName = "Full name must be under 100 characters.";
  }

  if (!data.phoneNumber || !data.phoneNumber.trim()) {
    errors.phoneNumber = "Phone number is required.";
  } else if (data.phoneNumber.trim().length > 30) {
    errors.phoneNumber = "Phone number must be under 30 characters.";
  }

  const parsedAge = parseInt(data.age, 10);
  if (data.age === undefined || data.age === null || data.age === "") {
    errors.age = "Age is required.";
  } else if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
    errors.age = "Age must be a valid number between 0 and 120.";
  }

  if (!data.sex) {
    errors.sex = "Please select your sex.";
  } else if (!["MALE", "FEMALE", "PREFER_NOT_TO_SAY"].includes(data.sex)) {
    errors.sex = "Invalid sex selection.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

test("Validate Check-in: Empty Fields", () => {
  const result = validateCheckInData({
    fullName: "",
    phoneNumber: "",
    age: "",
    sex: "",
  });
  
  assert.equal(result.valid, false);
  assert.equal(result.errors.fullName, "Full name is required.");
  assert.equal(result.errors.phoneNumber, "Phone number is required.");
  assert.equal(result.errors.age, "Age is required.");
  assert.equal(result.errors.sex, "Please select your sex.");
});

test("Validate Check-in: Long Text Violations", () => {
  const result = validateCheckInData({
    fullName: "A".repeat(101),
    phoneNumber: "1".repeat(31),
    age: 28,
    sex: "FEMALE",
  });
  
  assert.equal(result.valid, false);
  assert.equal(result.errors.fullName, "Full name must be under 100 characters.");
  assert.equal(result.errors.phoneNumber, "Phone number must be under 30 characters.");
});

test("Validate Check-in: Invalid Age Limits", () => {
  const resultNegative = validateCheckInData({
    fullName: "Ama Owusu",
    phoneNumber: "+233 24 123 4567",
    age: -5,
    sex: "FEMALE",
  });
  
  const resultOver = validateCheckInData({
    fullName: "Ama Owusu",
    phoneNumber: "+233 24 123 4567",
    age: 125,
    sex: "FEMALE",
  });
  
  assert.equal(resultNegative.valid, false);
  assert.equal(resultNegative.errors.age, "Age must be a valid number between 0 and 120.");
  assert.equal(resultOver.valid, false);
  assert.equal(resultOver.errors.age, "Age must be a valid number between 0 and 120.");
});

test("Validate Check-in: Valid Data Submission", () => {
  const result = validateCheckInData({
    fullName: "Ama Owusu",
    phoneNumber: "+233 24 123 4567",
    age: 28,
    sex: "FEMALE",
  });
  
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});
