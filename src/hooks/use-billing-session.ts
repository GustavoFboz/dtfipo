// Reuse the tested finite-session observer. It grants no Master permission;
// each billing RPC authorizes the company manager independently on the server.
export { useMasterSession as useBillingSession } from "./use-master-session";
