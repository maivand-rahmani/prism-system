/**
 * Exact semantic-version validation for the registry commands.
 *
 * The registry commands accept only an exact `major.minor.patch` version
 * (optionally with prerelease/build identifiers). npm ranges, tags, aliases,
 * git/file/workspace specs, and malformed versions are rejected before any
 * network or manager work.
 */

const EXACT_SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parse an exact semver string into comparable parts, or return null when the
 * value is not an exact version (ranges, tags, specs, malformed versions).
 */
export function parseExactSemver(value) {
  if (typeof value !== "string") return null;
  const match = EXACT_SEMVER_PATTERN.exec(value);
  if (match === null) return null;
  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split("."),
    build: match[5] === undefined ? [] : match[5].split("."),
  };
}

/** True when the value is an exact semver string. */
export function isExactSemver(value) {
  return parseExactSemver(value) !== null;
}

/** Throw a descriptive error when the value is not an exact semver string. */
export function assertExactSemver(value, label = "version") {
  if (!isExactSemver(value)) {
    throw new Error(
      `Invalid ${label} ${JSON.stringify(value ?? null)}; expected an exact semver ` +
        "(for example 1.2.3 or 1.2.3-rc.1). Tags, ranges, and aliases are not accepted.",
    );
  }
  return value;
}

function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // release > prerelease
  if (b.length === 0) return -1;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

/** Standard semver precedence comparison for exact versions. */
export function compareExactSemver(a, b) {
  const left = parseExactSemver(a);
  const right = parseExactSemver(b);
  if (left === null || right === null) {
    throw new Error(
      `Cannot compare invalid versions ${JSON.stringify(a)} and ${JSON.stringify(b)}.`,
    );
  }
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Descending comparator: newest exact version first; invalid versions last. */
export function compareSemverDesc(a, b) {
  const left = isExactSemver(a);
  const right = isExactSemver(b);
  if (left && right) return compareExactSemver(b, a);
  if (left) return -1;
  if (right) return 1;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
