// Runeframe swaps out the current screen subtree while a registered modal is open.
// Keep the pending approval across that unmount so closing a read-only diff returns
// to the same confirmation instead of the app's initial view.
const confirmationResumeByServices = new WeakMap();

export function rememberConfirmationForPreview(services, pendingConfirmation) {
  confirmationResumeByServices.set(services, {
    view: "confirm",
    pendingConfirmation,
  });
}

export function clearRememberedConfirmation(services) {
  confirmationResumeByServices.delete(services);
}

export function readRememberedConfirmation(services) {
  return confirmationResumeByServices.get(services) ?? null;
}
