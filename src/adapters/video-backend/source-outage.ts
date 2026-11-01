/**
 * Telling "the bytes are not there right now" apart from "this media is broken".
 *
 * A media-server restart produces two failure shapes in one outage:
 * connection-refused while the host is down, then a bad HTTP status the moment
 * it is listening again but has not finished mapping its routes. Treating only
 * the first as recoverable ends the restart on a 404 no retry ladder ever sees,
 * and the session dies under an error overlay while the server is two seconds
 * from answering again.
 *
 * The previous ladder here was three tries over seven seconds, which is shorter
 * than a .NET host takes to warm EF Core and reload its plugins — so the common
 * case, a server the viewer themselves just restarted, always lost.
 *
 * Kept separate from the backend so the decision can be checked without a
 * browser: every answer below is a number-to-verdict lookup, and a lookup that
 * has drifted is invisible in a screenshot. Playback still fails, it just fails
 * for a reason nobody chose.
 */

/**
 * Backoff for re-loading after the server drops out mid-playback. Starts tight
 * so a momentary blip is invisible, then settles to a steady 15 s poll — long
 * enough to sit out a host restart without hammering a server that is still
 * booting. The ladder's length IS the give-up budget (~105 s); past that the
 * failure is real and the error surfaces.
 */
export const SOURCE_OUTAGE_BACKOFF_MS: readonly number[] = [
	1_000,
	2_000,
	4_000,
	8_000,
	15_000,
	15_000,
	15_000,
	15_000,
	15_000,
	15_000,
];

/**
 * Rungs an HTTP-status failure gets when nothing connection-level preceded it
 * (~30 s). A video whose URL is genuinely gone answers 404 identically every
 * time, and making the viewer watch a spinner for the full budget before being
 * told so is its own bug.
 */
export const HTTP_STATUS_RETRY_LIMIT = 5;

/** Total wall-clock the ladder covers before a failure is treated as real. */
export function sourceOutageBudgetMs(): number {
	return SOURCE_OUTAGE_BACKOFF_MS.reduce((total, rung) => total + rung, 0);
}

/**
 * True for a status that means "the server is not there", as opposed to "the
 * server is there and this file is not".
 *
 * Measured on a real outage: a NoMercy server behind cloudflared never refuses
 * a connection while it restarts — the edge answers 530, and 52x for its other
 * failure modes. So the shape a restart actually takes is a bad HTTP status
 * with no connection error anywhere in front of it, which is exactly the case a
 * connection-failure-gated budget would cut short.
 */
export function isOriginDownStatus(httpStatus: number): boolean {
	return (httpStatus >= 520 && httpStatus <= 530)
		|| httpStatus === 502
		|| httpStatus === 503
		|| httpStatus === 504;
}

/** No rung at all: the answer will not change by asking again. */
export const NO_RETRIES = 0;

/**
 * True for a status that means the server answered, and answered that this
 * media does not exist.
 *
 * An episode that has not been encoded yet answers 404, and it will answer 404
 * to every retry: the file is not late, it is absent. Waiting is not a strategy
 * for it, and the viewer is the only one who can decide what to do instead.
 * 410 is the same answer said more firmly.
 */
export function isMediaAbsentStatus(httpStatus: number): boolean {
	return httpStatus === 404 || httpStatus === 410;
}

/** True for a 5xx from a server that is up (500, 501, 505...), as opposed to an origin-down status. */
export function isServerErrorStatus(httpStatus: number): boolean {
	return httpStatus >= 500 && httpStatus <= 599 && !isOriginDownStatus(httpStatus);
}

/**
 * How many rungs this failure is allowed.
 *
 * A 404 gets NONE. It used to get five, which is thirty seconds of spinner on
 * an episode that was never encoded, and at the end of it the viewer was told
 * nothing they could act on. A definite answer is worth surfacing the moment it
 * arrives, so the consumer can offer to move to the next item.
 *
 * @param httpStatus - The status the load gave up on, or 0 when the failure
 *   carried no response at all, which is what a refused connection looks like
 *   from a browser.
 * @param sawConnectionFailure - Whether anything in this outage already failed
 *   below the HTTP layer. That is what tells a restarting server's 404 apart
 *   from a video that is genuinely gone.
 */
export function sourceOutageRetryLimit(
	httpStatus: number,
	sawConnectionFailure: boolean,
): number {
	// A connection failure first means the host went away; the 404 that follows
	// is a route table still warming up, not a missing file.
	if (sawConnectionFailure)
		return SOURCE_OUTAGE_BACKOFF_MS.length;
	if (isOriginDownStatus(httpStatus))
		return SOURCE_OUTAGE_BACKOFF_MS.length;
	if (isMediaAbsentStatus(httpStatus) || isServerErrorStatus(httpStatus))
		return NO_RETRIES;
	if (httpStatus > 0)
		return HTTP_STATUS_RETRY_LIMIT;

	return SOURCE_OUTAGE_BACKOFF_MS.length;
}

/**
 * The code a consumer reads to offer "skip to the next item" rather than a dead
 * end. Its Kotlin peer is `CoreErrorCodes.MEDIA_ABSENT`; the two trios must
 * name this the same failure or a client written against one is wrong on the
 * other.
 */
export const MEDIA_ABSENT = 'core:stream/media-absent';

/** The server answered 5xx while up; the player raises a fatal error. */
export const SERVER_ERROR = 'core:stream/server-error';

/** The media request was refused with 401; the player refreshes the token once. */
export const UNAUTHENTICATED = 'core:auth/unauthenticated';

/** The code for a failure no retry changes, else `undefined`. */
export function definiteFailureCode(httpStatus: number, loading: boolean): string | undefined {
	if (isMediaAbsentStatus(httpStatus))
		return MEDIA_ABSENT;
	if (isServerErrorStatus(httpStatus))
		return SERVER_ERROR;
	// A 401 counts only while loading: mid-playback the ladder picks up a refreshed token.
	if (httpStatus === 401 && loading)
		return UNAUTHENTICATED;

	return undefined;
}
