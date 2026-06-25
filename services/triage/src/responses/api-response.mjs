/**
 * Formats a Lambda proxy integration response.
 * 
 * @param {number} statusCode
 * @param {object} body
 * @returns {object} Response object for API Gateway
 */
export function apiResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    },
    body: JSON.stringify(body)
  };
}
