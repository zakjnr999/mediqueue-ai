export class TriageError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TriageError';
    this.details = details;
  }
}
