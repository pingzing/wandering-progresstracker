/**
 * Calls console.log(), and prepends 'Wandering ProgressTracker:' to the given log line.
 * Assumes the first argument is a string, and all subsequent arguments are data.
 * @param data Data to log.
 */
export function wptLog(...data: any[]): void {
    console.log(`Wandering ProgressTracker: ${data[0]}`, ...data.slice(1));
}