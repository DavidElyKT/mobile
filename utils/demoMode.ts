export const DEMO_CUSTOMER_NAME = '(Demo) Workshop Assessment';

export function isDemoSite(site: { customer?: string | null } | null | undefined): boolean {
  return (site?.customer ?? '').trim().toLowerCase() === DEMO_CUSTOMER_NAME.toLowerCase();
}

export function filterDemoSites<T extends { customer?: string | null }>(
  sites: T[],
  isDemoMode: boolean,
): T[] {
  return isDemoMode ? sites.filter(isDemoSite) : sites;
}

export function isAdministratorRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'administrator';
}
