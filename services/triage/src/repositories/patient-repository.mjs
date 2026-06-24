import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
      ProjectionExpression: 'patientId, queueNumber, fullName, age, #status, aiAssessment, staffDecision, createdAt, entityType, isEscalated, escalatedBy',
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

/**
 * Updates patient priority with concurrency check on updatedAt.
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - Table name
 * @param {string} patientId - UUID
 * @param {object} params
 * @param {string} params.confirmedPriority - HIGH, MEDIUM, LOW
 * @param {string|null} params.overrideReason - string or null
 * @param {string|null} params.reviewerDisplayName - Display name of reviewer, or null
 * @param {string} params.reviewedAt - ISO timestamp
 * @param {string} params.expectedUpdatedAt - Expect stored updatedAt to match this
 * @param {string} params.updatedAt - ISO timestamp (same as reviewedAt)
 * @returns {Promise<object>} Updated patient record
 * @throws {ApiError}
 */
export async function updatePatientPriority(docClient, tableName, patientId, { confirmedPriority, overrideReason, reviewerDisplayName, reviewedAt, expectedUpdatedAt, updatedAt }) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }

  try {
    const response = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        id: `PATIENT#${patientId}`
      },
      UpdateExpression: 'SET staffDecision.confirmedPriority = :cp, staffDecision.reviewedAt = :ra, staffDecision.reviewedBy = :rb, staffDecision.reviewerDisplayName = :rdn, staffDecision.overrideReason = :or, #updatedAt = :ua',
      ConditionExpression: 'attribute_exists(id) AND entityType = :checkinEntityType AND #updatedAt = :expectedUpdatedAt',
      ExpressionAttributeNames: {
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':cp': confirmedPriority,
        ':ra': reviewedAt,
        ':rb': null,
        ':rdn': reviewerDisplayName !== undefined ? reviewerDisplayName : null,
        ':or': overrideReason,
        ':ua': updatedAt,
        ':checkinEntityType': 'PATIENT_CHECKIN',
        ':expectedUpdatedAt': expectedUpdatedAt
      },
      ReturnValues: 'ALL_NEW'
    }));
    return response.Attributes;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new ApiError('UPDATE_CONFLICT', 409, 'The patient record was updated by another user. Please reload and try again.', err);
    }
    throw new ApiError('DATABASE_ERROR', 500, `Database update failed: ${err.message}`, err);
  }
}

/**
 * Updates patient status with race-condition protection.
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - Table name
 * @param {string} patientId - UUID
 * @param {object} params
 * @param {string} params.newStatus - WAITING, IN_PROGRESS, COMPLETED
 * @param {string} params.expectedCurrentStatus - Expect stored status to match this
 * @param {string} params.updatedAt - ISO timestamp
 * @returns {Promise<object>} Updated patient record
 * @throws {ApiError}
 */
export async function updatePatientStatus(docClient, tableName, patientId, { newStatus, expectedCurrentStatus, updatedAt }) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }

  try {
    const response = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        id: `PATIENT#${patientId}`
      },
      UpdateExpression: 'SET #status = :ns, #updatedAt = :ua',
      ConditionExpression: 'attribute_exists(id) AND entityType = :checkinEntityType AND #status = :expectedCurrentStatus',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':ns': newStatus,
        ':ua': updatedAt,
        ':checkinEntityType': 'PATIENT_CHECKIN',
        ':expectedCurrentStatus': expectedCurrentStatus
      },
      ReturnValues: 'ALL_NEW'
    }));
    return response.Attributes;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new ApiError('UPDATE_CONFLICT', 409, 'The patient record status was updated by another user. Please reload and try again.', err);
    }
    throw new ApiError('DATABASE_ERROR', 500, `Database update failed: ${err.message}`, err);
  }
}

/**
 * Counts the number of active WAITING patients checked in before the current patient on the same date.
 * Uses GSI1 index with key range condition.
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {string} indexName - GSI index name
 * @param {object} params
 * @param {string} params.dateStr - Date string YYYY-MM-DD
 * @param {string} params.createdAt - ISO timestamp of the patient's check-in
 * @param {string} params.patientId - UUID of the patient
 * @returns {Promise<number>} Count of people ahead
 * @throws {ApiError}
 */
export async function countPeopleAhead(docClient, tableName, indexName, { dateStr, createdAt, patientId }) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }
  if (!indexName || indexName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database queue index configuration is missing');
  }

  let count = 0;
  let exclusiveStartKey = null;
  const pk = `QUEUE#${dateStr}`;
  const skLimit = `${createdAt}#${patientId}`;

  try {
    do {
      const params = {
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk < :skLimit',
        FilterExpression: '#status = :statusVal',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skLimit': skLimit,
          ':statusVal': 'WAITING'
        },
        Select: 'COUNT'
      };

      if (exclusiveStartKey) {
        params.ExclusiveStartKey = exclusiveStartKey;
      }

      const response = await docClient.send(new QueryCommand(params));
      count += response.Count || 0;
      exclusiveStartKey = response.LastEvaluatedKey || null;
    } while (exclusiveStartKey);

    return count;
  } catch (err) {
    throw new ApiError('DATABASE_ERROR', 500, `Database count query failed: ${err.message}`, err);
  }
}

/**
 * Retrieves all check-in records for a given date from GSI1 to compute statistics.
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {string} indexName - GSI index name
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @returns {Promise<Array>} List of patients
 * @throws {ApiError}
 */
export async function queryAllPatientsForDate(docClient, tableName, indexName, dateStr) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }
  if (!indexName || indexName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database queue index configuration is missing');
  }

  const items = [];
  let exclusiveStartKey = null;

  try {
    do {
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
        ProjectionExpression: 'patientId, queueNumber, #status, aiAssessment, staffDecision, createdAt, updatedAt, entityType'
      };

      if (exclusiveStartKey) {
        params.ExclusiveStartKey = exclusiveStartKey;
      }

      const response = await docClient.send(new QueryCommand(params));
      if (response.Items) {
        items.push(...response.Items);
      }
      exclusiveStartKey = response.LastEvaluatedKey || null;
    } while (exclusiveStartKey);

    return items;
  } catch (err) {
    throw new ApiError('DATABASE_ERROR', 500, `Database query failed: ${err.message}`, err);
  }
}

/**
 * Escalates a patient record by setting isEscalated = true and updating staffDecision attributes.
 * Conditional on record existence, status = 'WAITING', and version check (updatedAt = expectedUpdatedAt).
 *
 * @param {object} docClient - DynamoDBDocumentClient instance
 * @param {string} tableName - DynamoDB table name
 * @param {string} patientId - UUID
 * @param {object} params
 * @param {string} params.reviewerDisplayName - Name of staff member
 * @param {string} params.reviewedAt - ISO timestamp
 * @param {string} params.expectedUpdatedAt - Expect stored updatedAt to match this
 * @param {string} params.updatedAt - ISO timestamp
 * @returns {Promise<object>} Updated patient record attributes
 * @throws {ApiError}
 */
export async function escalatePatient(docClient, tableName, patientId, { reviewerDisplayName, reviewedAt, expectedUpdatedAt, updatedAt }) {
  if (!tableName || tableName.trim() === '') {
    throw new ApiError('CONFIGURATION_ERROR', 500, 'Database table name configuration is missing');
  }

  try {
    const response = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        id: `PATIENT#${patientId}`
      },
      UpdateExpression: 'SET isEscalated = :ie, escalatedBy = :eb, staffDecision.confirmedPriority = :cp, staffDecision.reviewedAt = :ra, staffDecision.reviewerDisplayName = :rd, #updatedAt = :ua',
      ConditionExpression: 'attribute_exists(id) AND entityType = :checkinEntityType AND #updatedAt = :expectedUpdatedAt AND #status = :expectedStatus',
      ExpressionAttributeNames: {
        '#updatedAt': 'updatedAt',
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':ie': true,
        ':eb': reviewerDisplayName,
        ':cp': 'HIGH',
        ':ra': reviewedAt,
        ':rd': reviewerDisplayName,
        ':ua': updatedAt,
        ':checkinEntityType': 'PATIENT_CHECKIN',
        ':expectedUpdatedAt': expectedUpdatedAt,
        ':expectedStatus': 'WAITING'
      },
      ReturnValues: 'ALL_NEW'
    }));
    return response.Attributes;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new ApiError('UPDATE_CONFLICT', 409, 'The patient record status or version changed. Please reload and try again.', err);
    }
    throw new ApiError('DATABASE_ERROR', 500, `Database update failed: ${err.message}`, err);
  }
}
