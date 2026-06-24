import { test } from "node:test";
import assert from "node:assert/strict";

// Helper that mirrors simulateBedrockTriage in api.ts
function simulateBedrockTriage(age, symptoms, additionalDetails = "", selfAssessedUrgency = "") {
  const allText = (symptoms.join(" ") + " " + additionalDetails).toLowerCase();
  
  const highRiskKeywords = [
    "chest pain", "shortness of breath", "difficulty breathing", "breathing difficulty",
    "stroke", "numbness", "unconscious", "seizure", "heavy bleeding", "poison",
    "suicidal", "severe allergic", "anaphylaxis", "choking", "chest tightness"
  ];
  
  const mediumRiskKeywords = [
    "fever", "vomiting", "abdominal pain", "dizziness", "fracture", "broken bone",
    "laceration", "moderate pain", "migraine", "asthma", "diarrhea", "dehydration",
    "infection", "burn"
  ];

  const foundRedFlags = [];
  
  symptoms.forEach(symptom => {
    const symLower = symptom.toLowerCase();
    if (highRiskKeywords.some(kw => symLower.includes(kw))) {
      foundRedFlags.push(symptom);
    }
  });

  highRiskKeywords.forEach(kw => {
    if (additionalDetails.toLowerCase().includes(kw) && !foundRedFlags.some(rf => rf.toLowerCase().includes(kw))) {
      foundRedFlags.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  });

  let suggestedPriority = "LOW";

  if (foundRedFlags.length > 0 || selfAssessedUrgency === "URGENT") {
    suggestedPriority = "HIGH";
  } else if (
    mediumRiskKeywords.some(kw => allText.includes(kw)) ||
    selfAssessedUrgency === "MODERATE" ||
    age < 2 || 
    age > 75
  ) {
    suggestedPriority = "MEDIUM";
  }

  return {
    suggestedPriority,
    redFlags: foundRedFlags,
  };
}

test("Triage Assessment: High Risk Chest Pain Symptom", () => {
  const result = simulateBedrockTriage(35, ["Chest pain"], "Felt sudden tightness during exercise");
  assert.equal(result.suggestedPriority, "HIGH");
  assert.equal(result.redFlags.length, 1);
  assert.equal(result.redFlags[0], "Chest pain");
});

test("Triage Assessment: High Risk Self-Assessed Urgency Override", () => {
  const result = simulateBedrockTriage(28, ["Headache"], "Mild headache", "URGENT");
  assert.equal(result.suggestedPriority, "HIGH");
});

test("Triage Assessment: Medium Risk Age (Infant)", () => {
  const result = simulateBedrockTriage(1, ["Cough"], "Mild cough", "MINOR");
  assert.equal(result.suggestedPriority, "MEDIUM");
});

test("Triage Assessment: Medium Risk Age (Elderly)", () => {
  const result = simulateBedrockTriage(80, ["Cough"], "Persistent cough for 2 days", "MINOR");
  assert.equal(result.suggestedPriority, "MEDIUM");
});

test("Triage Assessment: Medium Risk Symptoms", () => {
  const result = simulateBedrockTriage(45, ["Fever", "Vomiting"], "Temperature of 38.5C", "MINOR");
  assert.equal(result.suggestedPriority, "MEDIUM");
});

test("Triage Assessment: Low Risk Symptoms", () => {
  const result = simulateBedrockTriage(30, ["Cough", "Other"], "Slight throat irritation", "MINOR");
  assert.equal(result.suggestedPriority, "LOW");
});
