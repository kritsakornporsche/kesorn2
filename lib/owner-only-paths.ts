// /owner pages that only the owner may open (managers are redirected; menus hide them). /owner/settings is open to
// managers read-only (the page disables its fields; the API refuses their saves).
export const OWNER_ONLY_PATHS = ['/owner/accounting', '/owner/rules', '/owner/keepers'];

export function isMenuItemVisible(href: string, role: string | undefined) {
  return role !== 'manager' || !OWNER_ONLY_PATHS.includes(href);
}
