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
 * Lossless numeric-identifier comparison.
 *
 * Semver numeric identifiers may exceed `Number.MAX_SAFE_INTEGER`. Components
 * within the safe range stay Numbers (ordinary public shape); larger components
 * are canonical decimal strings (JSON-safe, never BigInt). Comparison is shared
 * by core components and numeric prerelease identifiers and never truncates:
 * canonicalize (numbers to decimal, strip leading zeros, zero becomes "0"), then
 * compare digit length, then lexicographically.
 */
function toCanonicalDigits(value) {
  const text = typeof value === "number" ? String(value) : String(value);
  const trimmed = text.replace(/^0+(?=\d)/, "");
  return trimmed === "" ? "0" : trimmed;
}

function compareNumericIdentifiers(left, right) {
  const leftDigits = toCanonicalDigits(left);
  const rightDigits = toCanonicalDigits(right);
  if (leftDigits.length !== rightDigits.length) {
    return leftDigits.length < rightDigits.length ? -1 : 1;
  }
  if (leftDigits === rightDigits) return 0;
  return leftDigits < rightDigits ? -1 : 1;
}

/** Numbers when exactly representable, otherwise canonical decimal strings. */
function numericComponent(digits) {
  const asNumber = Number(digits);
  return Number.isSafeInteger(asNumber) ? asNumber : digits;
}

/**
 * Parse an exact semver string into comparable parts, or return null when the
 * value is not an exact version (ranges, tags, specs, malformed versions).
 * All syntactically valid semver digits are accepted; components beyond the
 * safe-integer range are kept as canonical decimal strings so comparisons stay
 * lossless and results stay JSON-safe.
 */
export function parseExactSemver(value) {
  if (typeof value !== "string") return null;
  const match = EXACT_SEMVER_PATTERN.exec(value);
  if (match === null) return null;
  return {
    raw: value,
    major: numericComponent(match[1]),
    minor: numericComponent(match[2]),
    patch: numericComponent(match[3]),
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
      const diff = compareNumericIdentifiers(left, right);
      if (diff !== 0) return diff;
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
  const majorOrder = compareNumericIdentifiers(left.major, right.major);
  if (majorOrder !== 0) return majorOrder;
  const minorOrder = compareNumericIdentifiers(left.minor, right.minor);
  if (minorOrder !== 0) return minorOrder;
  const patchOrder = compareNumericIdentifiers(left.patch, right.patch);
  if (patchOrder !== 0) return patchOrder;
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

/* -------------------------------------------------------------------------- */
/* Semver range satisfaction (npm range subset, no runtime dependency)        */
/* -------------------------------------------------------------------------- */

/**
 * Range parsing for requirement ranges and peer validation. This is a
 * self-contained implementation of the common npm range grammar: exact
 * versions, `=`, `>`, `>=`, `<`, `<=`, tilde, caret, x-ranges/partials,
 * hyphen ranges, whitespace AND, and `||` unions. Build metadata is ignored;
 * prerelease gating follows npm semantics (a prerelease candidate only matches
 * a comparator set that explicitly mentions a prerelease on the same
 * major.minor.patch). Tags, aliases, git/file/workspace specs, and malformed
 * ranges are rejected.
 */

const PARTIAL_VERSION_PATTERN =
  /^(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

const OPERATOR_PATTERN = /^(<=|>=|<|>|=|~|\^)?(.*)$/;

function isXPart(value) {
  return value === undefined || value === "x" || value === "X" || value === "*";
}

/** Parse a full or partial (`x`-range) version, or return null. */
export function parsePartialVersion(value) {
  if (typeof value !== "string") return null;
  const match = PARTIAL_VERSION_PATTERN.exec(value.trim());
  if (match === null) return null;
  const major = isXPart(match[1]) ? null : numericComponent(match[1]);
  const minor = isXPart(match[2]) ? null : numericComponent(match[2]);
  const patch = isXPart(match[3]) ? null : numericComponent(match[3]);
  if (minor === null && patch !== null) return null;
  const prerelease = match[4];
  if (prerelease !== undefined && (major === null || minor === null || patch === null)) return null;
  return {
    major,
    minor,
    patch,
    prerelease: prerelease === undefined ? [] : prerelease.split("."),
  };
}

function fullVersion(major, minor, patch, prerelease = []) {
  const base = `${major}.${minor}.${patch}`;
  return prerelease.length === 0 ? base : `${base}-${prerelease.join(".")}`;
}

/**
 * The next numeric identifier after `value`. Uses exact big-integer arithmetic
 * internally (never exposed) and returns a Number when the successor is a safe
 * integer, otherwise the canonical decimal string. This keeps generated range
 * bounds lossless and JSON-safe with no overflow and no rounded `+1`.
 */
function successorIdentifier(value) {
  const next = BigInt(String(value)) + 1n;
  const asNumber = Number(next);
  return Number.isSafeInteger(asNumber) ? asNumber : next.toString();
}

function comparator(operator, version) {
  return { operator, version };
}

/** Expand one operator + partial version into concrete npm comparators. */
function expandComparator(operator, partial) {
  const { major, minor, patch, prerelease } = partial;
  if (major === null) {
    return operator === undefined || operator === "=" || operator === "~" || operator === "^"
      ? []
      : null;
  }
  const prereleaseSuffix = prerelease.length === 0 ? [] : prerelease;
  if (minor !== null && patch !== null) {
    const exact = fullVersion(major, minor, patch, prereleaseSuffix);
    if (operator === undefined || operator === "=") return [comparator("=", exact)];
    if (operator === ">") return [comparator(">", exact)];
    if (operator === ">=") return [comparator(">=", exact)];
    if (operator === "<") return [comparator("<", exact)];
    if (operator === "<=") return [comparator("<=", exact)];
    if (operator === "~") {
      return [
        comparator(">=", exact),
        comparator("<", fullVersion(major, successorIdentifier(minor), 0, ["0"])),
      ];
    }
    if (operator === "^") {
      if (compareNumericIdentifiers(major, 0) > 0) {
        return [
          comparator(">=", exact),
          comparator("<", fullVersion(successorIdentifier(major), 0, 0, ["0"])),
        ];
      }
      if (compareNumericIdentifiers(minor, 0) > 0) {
        return [
          comparator(">=", exact),
          comparator("<", fullVersion(0, successorIdentifier(minor), 0, ["0"])),
        ];
      }
      return [
        comparator(">=", exact),
        comparator("<", fullVersion(0, 0, successorIdentifier(patch), ["0"])),
      ];
    }
    return null;
  }
  if (minor === null) {
    // `1`, `1.x`, `*`-style major-only ranges.
    if (operator === undefined || operator === "=" || operator === "~" || operator === "^") {
      return [
        comparator(">=", fullVersion(major, 0, 0)),
        comparator("<", fullVersion(successorIdentifier(major), 0, 0, ["0"])),
      ];
    }
    if (operator === ">") {
      return [comparator(">=", fullVersion(successorIdentifier(major), 0, 0))];
    }
    if (operator === ">=") return [comparator(">=", fullVersion(major, 0, 0))];
    if (operator === "<") return [comparator("<", fullVersion(major, 0, 0))];
    if (operator === "<=") {
      return [comparator("<", fullVersion(successorIdentifier(major), 0, 0, ["0"]))];
    }
    return null;
  }
  // `1.2`, `1.2.x`-style minor-only ranges.
  if (operator === undefined || operator === "=" || operator === "~") {
    return [
      comparator(">=", fullVersion(major, minor, 0)),
      comparator("<", fullVersion(major, successorIdentifier(minor), 0, ["0"])),
    ];
  }
  if (operator === "^") {
    if (compareNumericIdentifiers(major, 0) > 0) {
      return [
        comparator(">=", fullVersion(major, minor, 0)),
        comparator("<", fullVersion(successorIdentifier(major), 0, 0, ["0"])),
      ];
    }
    if (compareNumericIdentifiers(minor, 0) > 0) {
      return [
        comparator(">=", fullVersion(0, minor, 0)),
        comparator("<", fullVersion(0, successorIdentifier(minor), 0, ["0"])),
      ];
    }
    return [comparator(">=", fullVersion(0, 0, 0)), comparator("<", fullVersion(0, 1, 0, ["0"]))];
  }
  if (operator === ">") {
    return [comparator(">=", fullVersion(major, successorIdentifier(minor), 0))];
  }
  if (operator === ">=") return [comparator(">=", fullVersion(major, minor, 0))];
  if (operator === "<") return [comparator("<", fullVersion(major, minor, 0))];
  if (operator === "<=") {
    return [comparator("<", fullVersion(major, successorIdentifier(minor), 0, ["0"]))];
  }
  return null;
}

function expandHyphen(left, right) {
  const lower = parsePartialVersion(left);
  const upper = parsePartialVersion(right);
  if (lower === null || upper === null) return null;
  const comparators = [];
  if (lower.major !== null) {
    if (lower.minor === null) {
      comparators.push(comparator(">=", fullVersion(lower.major, 0, 0)));
    } else if (lower.patch === null) {
      comparators.push(comparator(">=", fullVersion(lower.major, lower.minor, 0)));
    } else {
      comparators.push(
        comparator(">=", fullVersion(lower.major, lower.minor, lower.patch, lower.prerelease)),
      );
    }
  }
  if (upper.major !== null) {
    if (upper.minor === null) {
      comparators.push(comparator("<", fullVersion(successorIdentifier(upper.major), 0, 0, ["0"])));
    } else if (upper.patch === null) {
      comparators.push(
        comparator("<", fullVersion(upper.major, successorIdentifier(upper.minor), 0, ["0"])),
      );
    } else {
      comparators.push(
        comparator("<=", fullVersion(upper.major, upper.minor, upper.patch, upper.prerelease)),
      );
    }
  }
  return comparators;
}

function parseComparatorSet(text) {
  const hyphen = /\s+-\s+/.test(text) ? text.split(/\s+-\s+/) : null;
  if (hyphen !== null) {
    if (hyphen.length !== 2) return null;
    const expanded = expandHyphen(hyphen[0].trim(), hyphen[1].trim());
    return expanded;
  }
  const tokens = text.trim() === "" ? ["*"] : text.trim().split(/\s+/);
  const comparators = [];
  for (const token of tokens) {
    const match = OPERATOR_PATTERN.exec(token);
    if (match === null) return null;
    const operator = match[1] === undefined ? undefined : match[1];
    const partial = parsePartialVersion(match[2]);
    if (partial === null) return null;
    const expanded = expandComparator(operator, partial);
    if (expanded === null) return null;
    comparators.push(...expanded);
  }
  return comparators;
}

/** Parse an npm semver range into comparator sets, or return null when invalid. */
export function parseVersionRange(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const sets = [];
  for (const union of value.split("||")) {
    const comparators = parseComparatorSet(union);
    if (comparators === null) return null;
    sets.push(comparators);
  }
  return { raw: value.trim(), sets };
}

/** True when the value is a valid npm semver range for requirements/peers. */
export function isValidSemverRange(value) {
  return parseVersionRange(value) !== null;
}

/** True when the range is a single exact version (no ranges or wildcards). */
export function isExactSemverRange(value) {
  return exactSemverRange(value) !== null;
}

/**
 * Return the exact version when the range is a single exact version (`1.2.3`
 * or `=1.2.3`), otherwise null. Used to decide whether a missing peer can be
 * installed from its declared range without an explicit `--peer` override.
 */
export function exactSemverRange(value) {
  const parsed = parseVersionRange(value);
  if (parsed === null) return null;
  if (parsed.sets.length !== 1 || parsed.sets[0].length !== 1) return null;
  const [only] = parsed.sets[0];
  if (only.operator !== "=" || !isExactSemver(only.version)) return null;
  return only.version;
}

function comparatorMatches(comparatorValue, version) {
  const order = compareExactSemver(version, comparatorValue.version);
  switch (comparatorValue.operator) {
    case "=":
      return order === 0;
    case ">":
      return order > 0;
    case ">=":
      return order >= 0;
    case "<":
      return order < 0;
    case "<=":
      return order <= 0;
    default:
      return false;
  }
}

/**
 * True when an exact version satisfies an npm range. Invalid versions return
 * false; an invalid range throws, so callers can distinguish a malformed range
 * from a non-match.
 */
export function satisfiesSemverRange(version, range) {
  const parsedVersion = parseExactSemver(version);
  const parsedRange = parseVersionRange(range);
  if (parsedRange === null) {
    throw new Error(`Invalid semver range ${JSON.stringify(range ?? null)}.`);
  }
  if (parsedVersion === null) return false;
  const hasPrerelease = parsedVersion.prerelease.length > 0;
  return parsedRange.sets.some((set) => {
    if (set.length === 0) return true;
    if (hasPrerelease) {
      const allowed = set.some((entry) => {
        const candidate = parseExactSemver(entry.version);
        return (
          candidate !== null &&
          candidate.prerelease.length > 0 &&
          compareNumericIdentifiers(candidate.major, parsedVersion.major) === 0 &&
          compareNumericIdentifiers(candidate.minor, parsedVersion.minor) === 0 &&
          compareNumericIdentifiers(candidate.patch, parsedVersion.patch) === 0
        );
      });
      if (!allowed) return false;
    }
    return set.every((entry) => comparatorMatches(entry, version));
  });
}
