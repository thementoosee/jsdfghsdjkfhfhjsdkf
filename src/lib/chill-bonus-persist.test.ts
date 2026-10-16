import { describe, expect, it } from 'vitest';
import { isMissingSlotColumnError } from './chill-bonus-persist';

describe('isMissingSlotColumnError', () => {
  it('detects PostgREST schema cache / missing column errors', () => {
    expect(isMissingSlotColumnError({ code: 'PGRST204', message: 'column' })).toBe(true);
    expect(
      isMissingSlotColumnError({
        message: "Could not find the 'slot_name' column of 'chill_bonuses' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingSlotColumnError({ code: '42703', message: 'column slot_id does not exist' })).toBe(
      true,
    );
    expect(isMissingSlotColumnError({ message: 'network error' })).toBe(false);
  });
});
