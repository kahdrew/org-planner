/**
 * Shared constants for server integration tests.
 *
 * TEST_PASSWORD is used by every test that registers a throwaway user against
 * the ephemeral test database. Keeping it as a constant (sourced from the
 * TEST_PASSWORD env var with a non-production fallback) avoids hardcoding
 * password-like literals across the test suite, which would otherwise be
 * flagged by secret-scanning tools.
 *
 * Override via the TEST_PASSWORD environment variable when running tests
 * locally or in CI if desired. The fallback is intentionally not a real
 * credential — it only exists so tests satisfy the 6-char minimum password
 * validation on registration.
 */
export const TEST_PASSWORD: string =
  process.env.TEST_PASSWORD ?? "P@ssw0rd1";
