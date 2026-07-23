/**
 * Guard'dan keyin `request.user` da yotadigan qiymat.
 * Payload'da rollar YO'Q — docs/10-security.md §3.4.
 */
export interface AuthenticatedUser {
  userId: string;
  /** Sessiya (refresh oilasi) identifikatori */
  sessionId: string;
}
