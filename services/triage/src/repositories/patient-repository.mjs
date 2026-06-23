import { PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CheckinError } from '../errors/checkin-error.mjs';
import { ApiError } from '../errors/api-error.mjs';

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

/**
 * Queries the staff queue GSI for patient check-ins on a specific date.
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {string} indexName - GSI index name
 * @param {object} params
 * @param {string} params.dateStr - Date string YYYY-MM-DD
 * @param {number} params.limit - Query limit
 * @param {object} [params.exclusiveStartKey] - Pagination start key
 * @returns {Promise<object>} Query results containing items and lastEvaluatedKey
 * @throws {ApiError}
 */
export async function queryPatientQueue(docClient, tableName, indexName, { dateStr, limit, exclusiveStartKey }) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }
  if (!indexName || indexName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database queue index configuration is missing');
  }

  try {
    const params = {
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': `QUEUE#${dateStr}`
      },
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      // Restrict projected fields to avoid returning unapproved items or sensitive data
      ProjectionExpression: 'patientId, queueNumber, fullName, age, #status, aiAssessment, staffDecision, createdAt, entityType',
      ScanIndexForward: true, // ASC order (first-come, first-served)
      Limit: limit
    };

    if (exclusiveStartKey) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    const response = await docClient.send(new QueryCommand(params));
    return {
      items: response.Items || [],
      lastEvaluatedKey: response.LastEvaluatedKey || null
    };
  } catch (err) {
    throw new ApiError('DATABASE_ERROR', 500, `Database query failed: ${err.message}`, err);
  }
}

/**
 * Retrieves full patient check-in details using GetCommand with ConsistentRead.
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {string} patientId - Lowercase v4 UUID string
 * @returns {Promise<object|null>} Patient item or null
 * @throws {ApiError}
 */
export async function getPatientDetails(docClient, tableName, patientId) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }

  try {
    const response = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: {
        id: `PATIENT#${patientId}`
      },
      ConsistentRead: true
    }));
    return response.Item || null;
  } catch (err) {
    throw new ApiError('DATABASE_ERROR', 500, `Database retrieval failed: ${err.message}`, err);
  }
}
