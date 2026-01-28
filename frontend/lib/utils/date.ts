/**
 * Date formatting utilities
 *
 * These functions provide consistent date formatting that avoids
 * hydration errors by using fixed formats instead of locale-dependent ones.
 */

export type DateFormat =
  | 'date' // YYYY-MM-DD
  | 'datetime' // YYYY-MM-DD HH:mm
  | 'datetime-short' // MM-DD HH:mm
  | 'time' // HH:mm
  | 'relative'; // X days ago (only safe on client)

/**
 * Format a date string safely to avoid hydration mismatches.
 * Uses consistent formatting that works the same on server and client.
 */
export function formatDateSafe(
  dateStr: string | Date | null | undefined,
  format: DateFormat = 'datetime'
): string {
  if (!dateStr) return '--';

  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '--';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    switch (format) {
      case 'date':
        return `${year}-${month}-${day}`;
      case 'datetime':
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      case 'datetime-short':
        return `${month}-${day} ${hours}:${minutes}`;
      case 'time':
        return `${hours}:${minutes}`;
      case 'relative':
        // For relative dates, fall back to datetime to avoid hydration issues
        // Use ClientDate component for relative formatting
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      default:
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
  } catch {
    return '--';
  }
}

/**
 * Check if a date is today
 */
export function isToday(dateStr: string | Date | null | undefined): boolean {
  if (!dateStr) return false;
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
}
