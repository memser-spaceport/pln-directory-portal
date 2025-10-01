/**
 * Utility functions for mapping technical error messages to user-friendly messages
 */

/**
 * Maps backend error messages to user-friendly messages for demo day participant uploads
 */
export function mapDemoDayParticipantError(errorMessage: string): string {
  if (!errorMessage) return 'Unknown error occurred';

  const message = errorMessage.toLowerCase();

  // Common error patterns and their user-friendly equivalents
  if (message.includes('participant already exists for this demo day')) {
    return 'This person is already registered for this demo day';
  }

  if (message.includes('member not found') || message.includes('invalid access level')) {
    return 'User account not found or has restricted access';
  }

  if (message.includes('either memberuid or email must be provided')) {
    return 'Email address is required';
  }

  if (message.includes('participant not found')) {
    return 'Participant record not found';
  }

  if (message.includes('team can only be assigned to founder type participants')) {
    return 'Teams can only be assigned to founder participants';
  }

  if (message.includes('email') && message.includes('invalid')) {
    return 'Please provide a valid email address';
  }

  if (message.includes('team lead') && (message.includes('already exists') || message.includes('conflict'))) {
    return 'A team lead already exists for this team';
  }

  if (message.includes('team') && message.includes('lead') && message.includes('cannot be assigned')) {
    return 'Cannot assign team lead role - another member is already the lead';
  }

  if (message.includes('duplicate') && message.includes('key')) {
    return 'This email address is already registered';
  }

  if (message.includes('foreign key constraint') || message.includes('constraint')) {
    return 'Invalid data provided - please check all fields';
  }

  if (message.includes('required') && message.includes('name')) {
    return 'Name is required';
  }

  if (message.includes('organization') && message.includes('required')) {
    return 'Organization name is required for team creation';
  }

  // Database-related errors
  if (message.includes('prisma') || message.includes('database')) {
    return 'A system error occurred while processing your request';
  }

  // Validation errors
  if (message.includes('validation') || message.includes('invalid')) {
    return 'Please check your data and try again';
  }

  // If we can't map it to a specific user-friendly message, provide a generic but helpful message
  return 'Unable to process this participant. Please check the information and try again.';
}
