import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

/**
 * Initializes and returns a BedrockRuntimeClient.
 * @returns {BedrockRuntimeClient}
 */
export function getBedrockClient() {
  const region = process.env.AWS_REGION || 'us-west-2';
  return new BedrockRuntimeClient({ region });
}
