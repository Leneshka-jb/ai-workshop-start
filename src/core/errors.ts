/** A failure explained to the user: the CLI prints the message and exits with code 1. */
export class AtlasError extends Error {}

/** GitHub cannot answer at all (unreachable, rate limit, rejected token): no later request would either. */
export class GitHubUnavailableError extends AtlasError {}
