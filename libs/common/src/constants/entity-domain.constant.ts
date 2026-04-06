import { EntityDomain } from '@prisma/client';

export const TRANSIENT_STATES_BY_DOMAIN: Partial<
  Record<EntityDomain, string[]>
> = {
  [EntityDomain.curtain]: ['OPENING', 'CLOSING'],
  [EntityDomain.lock]: ['UNLOCKING', 'LOCKING'],
  [EntityDomain.climate]: ['DEFROSTING'],
  [EntityDomain.update]: ['INSTALLING', 'DOWNLOADING'],
};

/**
 * Checks if a given state is an intermediate/transient state for the specific entity domain.
 * Transient states should NOT be saved to the database history to avoid clutter.
 */
export function isTransientState(
  domain: EntityDomain,
  state: string | number,
): boolean {
  const transientStates = TRANSIENT_STATES_BY_DOMAIN[domain];
  if (!transientStates) return false;
  return transientStates.includes(String(state).toUpperCase());
}
