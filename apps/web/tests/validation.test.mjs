import { test } from "node:test";
import assert from "node:assert/strict";

// Helper function that mirrors the frontend validation logic in check-in page
const GHANA_PHONE_REGEX = /^(?:\+233|233|0)(?:20|23|24|25|26|27|28|29|50|53|54|55|56|57|58|59)\d{7}$/;

function normalizePhone(value) {
  return String(value).replace(/[\s()-]/g, "");
}

function hasRepeatedDigitsOnly(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 9 && /^(\d)\1+$/.test(digits);
}

function validateCheckInData(data) {
  const errors = {};

  if (!data.fullName || !data.fullName.trim()) {
    errors.fullName = "Full name is required.";
  } else if (data.fullName.trim().length < 2) {
    errors.fullName = "Full name must be at least 2 characters.";
  } else if (data.fullName.trim().length > 100) {
    errors.fullName = "Full name must be under 100 characters.";
  } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(data.fullName.trim())) {
    errors.fullName = "Full name contains invalid characters.";
  }

  if (!data.phoneNumber || !data.phoneNumber.trim()) {
    errors.phoneNumber = "Phone number is required.";
  } else {
    const phone = normalizePhone(data.phoneNumber);
    if (hasRepeatedDigitsOnly(data.phoneNumber) || !GHANA_PHONE_REGEX.test(phone)) {
      errors.phoneNumber = "Phone number must be a valid Ghana mobile number.";
    }
  }

  const parsedAge = Number(data.age);
  if (data.age === undefined || data.age === null || data.age === "") {
    errors.age = "Age is required.";
  } else if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
    errors.age = "Age must be a valid whole number between 1 and 120.";
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
    phoneNumber: "024 123 4567",
    age: 28,
    sex: "FEMALE",
  });
  
  assert.equal(result.valid, false);
  assert.equal(result.errors.fullName, "Full name must be under 100 characters.");
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
  assert.equal(resultNegative.errors.age, "Age must be a valid whole number between 1 and 120.");
  assert.equal(resultOver.valid, false);
  assert.equal(resultOver.errors.age, "Age must be a valid whole number between 1 and 120.");
});

test("Validate Check-in: Invalid Phone Formats", () => {
  const badLetters = validateCheckInData({
    fullName: "Ama Owusu",
    phoneNumber: "abc123456789xyz",
    age: 28,
    sex: "FEMALE",
  });

  const badRepeated = validateCheckInData({
    fullName: "Ama Owusu",
    phoneNumber: "0000000000",
    age: 28,
    sex: "FEMALE",
  });

  const badPrefix = validateCheckInData({
    fullName: "Ama Owusu",
    phoneNumber: "012 345 6789",
    age: 28,
    sex: "FEMALE",
  });

  assert.equal(badLetters.valid, false);
  assert.equal(badLetters.errors.phoneNumber, "Phone number must be a valid Ghana mobile number.");
  assert.equal(badRepeated.valid, false);
  assert.equal(badRepeated.errors.phoneNumber, "Phone number must be a valid Ghana mobile number.");
  assert.equal(badPrefix.valid, false);
  assert.equal(badPrefix.errors.phoneNumber, "Phone number must be a valid Ghana mobile number.");
});

test("Validate Check-in: Valid Ghana Phone Formats", () => {
  for (const phoneNumber of ["024 123 4567", "+233 24 123 4567", "233241234567", "0551234567"]) {
    const result = validateCheckInData({
      fullName: "Ama Owusu",
      phoneNumber,
      age: 28,
      sex: "FEMALE",
    });

    assert.equal(result.valid, true, phoneNumber);
    assert.deepEqual(result.errors, {});
  }
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
