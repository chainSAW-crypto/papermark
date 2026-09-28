// Event types whose [start_time, end_time) range means the video was playing
const PLAYBACK_EVENT_TYPES = ["played", "muted", "unmuted", "rate_changed"];

type VideoEvent = {
  view_id: string;
  event_type: string;
  start_time: number;
  end_time: number;
};

/**
 * Watch time for one view, in seconds. `totalWatchTime` counts replays,
 * `uniqueWatchTime` counts each second of the video once (used for
 * completion).
 */
export function getVideoWatchTime(events: VideoEvent[], viewId: string) {
  // Track timestamps and their frequency for total watch time
  const timestampCounts = new Map<number, number>();

  events
    .filter(
      (event) =>
        event.view_id === viewId &&
        PLAYBACK_EVENT_TYPES.includes(event.event_type) &&
        event.end_time > event.start_time &&
        event.end_time - event.start_time >= 1,
    )
    .forEach((event) => {
      for (let t = event.start_time; t < event.end_time; t++) {
        const timestamp = Math.floor(t);
        timestampCounts.set(
          timestamp,
          (timestampCounts.get(timestamp) || 0) + 1,
        );
      }
    });

  let totalWatchTime = 0;
  timestampCounts.forEach((count) => {
    totalWatchTime += count;
  });

  return { totalWatchTime, uniqueWatchTime: timestampCounts.size };
}

export function getVideoCompletionRate(
  uniqueWatchTime: number,
  videoLength: number,
) {
  return videoLength > 0
    ? Math.min(100, (uniqueWatchTime / videoLength) * 100)
    : 0;
}
