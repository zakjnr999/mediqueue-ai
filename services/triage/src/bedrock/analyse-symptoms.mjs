import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getBedrockClient } from './client.mjs';
import { SYSTEM_PROMPT, formatPatientInput } from './prompt.mjs';
import { validatePatientInput } from '../validation/validate-patient-input.mjs';
import { validateTriageResponse } from '../validation/validate-triage-response.mjs';
import { TriageError } from '../errors/triage-error.mjs';

/**
 * Analyzes patient symptoms using Amazon Bedrock with strict input/output validation.
 * @param {object} patientData
 * @returns {Promise<object>} Validated triage response
 */
export async function analyseSymptoms(patientData) {
  // 1. Validate patient input before invoking Bedrock
  validatePatientInput(patientData);

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId || modelId.trim() === '') {
    throw new TriageError('BEDROCK_MODEL_ID environment variable is required');
  }

  const client = getBedrockClient();
  const userMessage = formatPatientInput(patientData);

  const command = new ConverseCommand({
    modelId,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [
      {
        role: 'user',
        content: [{ text: userMessage }]
      }
    ],
    inferenceConfiguration: {
      temperature: 0.0, // Strict, deterministic output
      maxTokens: 1000
    }
  });

  try {
    const response = await client.send(command);

    if (!response.output || !response.output.message || !response.output.message.content) {
      throw new TriageError('Bedrock response did not contain expected message structure', { response });
    }

    const contentArray = response.output.message.content;
    const textContent = contentArray.find(item => item.text !== undefined);
    
    if (!textContent || !textContent.text) {
      throw new TriageError('Bedrock response message content is empty', { response });
    }

    const rawResponse = textContent.text;

    // 2. Validate and parse response
    // validateTriageResponse handles code fence cleaning and strict type checks
    const validatedJson = validateTriageResponse(rawResponse);

    return validatedJson;
  } catch (err) {
    if (err instanceof TriageError) {
      throw err;
    }
    throw new TriageError(`Triage analysis failed: ${err.message}`, { originalError: err });
  }
}
