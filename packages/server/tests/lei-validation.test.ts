import { describe, it, expect } from 'vitest';
import { isValidLei } from '../src/shared/utils/index';

/**
 * Sprint 6.6 — ISO 17442 LEI validation.
 *
 * Reference LEIs are publicly listed in the GLEIF database. We validate the
 * format (20 alphanumeric, last two are digits) and the mod 97-10 checksum.
 *
 * Empty string is accepted (LEI is optional for non-regulated tenants).
 */
describe('Sprint 6.6 — isValidLei (ISO 17442)', () => {
  it('accepts empty string (LEI optional for unregulated tenants)', () => {
    expect(isValidLei('')).toBe(true);
  });

  // Real, public LEIs from GLEIF — these have real mod-97 check digits.
  it.each([
    ['529900T8BM49AURSDO55', 'JPMorgan Chase Bank NA'],
    ['7H6GLXDRUGQFU57RNE97', 'Morgan Stanley'],
    ['G5GSEF7VJP5I7OUK5573', 'Barclays Bank PLC'],
  ])('accepts real LEI %s (%s)', (lei) => {
    expect(isValidLei(lei)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidLei('TOOSHORT')).toBe(false);
    expect(isValidLei('529900T8BM49AURSDO551')).toBe(false); // 21 chars
  });

  it('rejects lowercase letters', () => {
    expect(isValidLei('529900t8bm49aursdo55')).toBe(false);
  });

  it('rejects non-alphanumeric characters', () => {
    expect(isValidLei('529900T8BM49AURSDO-5')).toBe(false);
  });

  it('rejects last two characters being letters', () => {
    expect(isValidLei('529900T8BM49AURSDOAA')).toBe(false);
  });

  it('rejects valid format with bad checksum', () => {
    // JPMorgan LEI with the check digits zeroed — fails mod-97
    expect(isValidLei('529900T8BM49AURSDO00')).toBe(false);
    // Barclays LEI with body letter swapped — flips the checksum
    expect(isValidLei('G5GSEF7VJP5I7OUK1573')).toBe(false);
  });
});
