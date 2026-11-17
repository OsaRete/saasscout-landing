/** Backward-compatible CLI entrypoint.
 * Invitation-only acceptance was superseded by the Open Free Beta product model.
 * Run the current real Auth/PostgREST fresh/upgrade contract, retaining all local
 * fixture/ownership/remote-target guards. Historical evidence remains in git and
 * docs/BETA_MEMBERSHIP_ACCESS.md; do not restore invitation assertions here.
 */
import "./open-beta-db.ts";
