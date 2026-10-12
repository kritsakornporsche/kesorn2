// /owner pages that only the owner may open (managers are redirected; menus hide them)
export const OWNER_ONLY_PATHS = ['/owner/accounting', '/owner/rules', '/owner/keepers', '/owner/settings'];

export function isMenuItemVisible(href: string, role: string | undefined) {
  return role !== 'manager' || !OWNER_ONLY_PATHS.includes(href);
}
