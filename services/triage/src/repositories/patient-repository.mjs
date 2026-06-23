import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { CheckinError } from '../errors/checkin-error.mjs';

/**
 * Saves a patient check-in record to DynamoDB with collision protection.
 * 
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {object} item - The full patient check-in record item
 * @returns {Promise<void>}
 * @throws {CheckinError}
 */
export async function savePatientCheckin(docClient, tableName, item) {
  if (!tableName || tableName.trim() === '') {
    throw new CheckinError('CONFIGURATION_ERROR', 500, 'PATIENTS_TABLE_NAME environment variable is required');
  }

  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)'
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new CheckinError('DATABASE_ERROR', 500, 'A patient record collision occurred', err);
    }
    throw new CheckinError('DATABASE_ERROR', 500, `Failed to save patient check-in: ${err.message}`, err);
  }
}
