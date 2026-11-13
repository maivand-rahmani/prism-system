/**
 * Human-readable reporters shared by more than one command family.
 *
 * Package-internal and output-only: these helpers format the result they are
 * given and write to stdout; they never mutate files, state, or exit codes
 * beyond the failure reporter's established behavior.
 */

function reportCommandFailure(label, error) {
  process.stdout.write(`${label}\n\n  ${error.message}\n`);
  process.exitCode = 1;
}

/** Write the selected entry's peer plan as human-readable lines. */
function writePeerPlan(peers, label = "peer plan") {
  if (!Array.isArray(peers) || peers.length === 0) return;
  process.stdout.write(`  ${label}:\n`);
  for (const peer of peers) {
    process.stdout.write(
      `    ${peer.name} [${peer.kind}] ${peer.range}${peer.optional ? " optional" : ""} -> ` +
        `${peer.action}${peer.version ? ` ${peer.version}` : ""}` +
        `${peer.installed ? ` (installed ${peer.installed})` : ""}\n`,
    );
  }
}

export { reportCommandFailure, writePeerPlan };
