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
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}
