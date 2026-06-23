import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CheckinError } from '../errors/checkin-error.mjs';

/**
 * Generates a unique queue number atomically using DynamoDB daily counter.
 * 
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {string} dateStr - Date string in YYYYMMDD format (UTC)
 * @param {string} nowIso - Current ISO-8601 UTC timestamp
 * @returns {Promise<string>} The generated queue number (e.g., MQ-YYYYMMDD-0001)
 * @throws {CheckinError}
 */
export async function generateQueueNumber(docClient, tableName, dateStr, nowIso) {
  if (!tableName || tableName.trim() === '') {
    throw new CheckinError('CONFIGURATION_ERROR', 500, 'PATIENTS_TABLE_NAME environment variable is required');
  }

  const counterId = `COUNTER#${dateStr}`;

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id: counterId },
      UpdateExpression: 'SET entityType = if_not_exists(entityType, :et), updatedAt = :updatedAt ADD currentValue :inc',
      ExpressionAttributeValues: {
        ':et': 'DAILY_COUNTER',
        ':updatedAt': nowIso,
        ':inc': 1
      },
      ReturnValues: 'UPDATED_NEW'
    }));

    const val = result.Attributes?.currentValue;
    if (val === undefined || val === null || !Number.isInteger(val) || val <= 0) {
      throw new CheckinError('QUEUE_NUMBER_ERROR', 500, 'Invalid queue number returned from database');
    }

    // Padded to at least 4 digits, but does not truncate larger numbers.
    const paddedVal = String(val).length < 4 ? String(val).padStart(4, '0') : String(val);
    return `MQ-${dateStr}-${paddedVal}`;
  } catch (err) {
    if (err instanceof CheckinError) {
      throw err;
    }
    throw new CheckinError('QUEUE_NUMBER_ERROR', 500, `Failed to generate queue number: ${err.message}`, err);
  }
}
