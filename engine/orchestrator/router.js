/**
 * router.js
 * Stateless event-to-pipeline matcher (FR-003, FR-014, FR-016).
 *
 * matchEvent(event, pipelines) → Pipeline | null
 *
 * event shape: { type: string, labels: string[], state?: string }
 * Pipeline trigger shape: { event: string, labels?: string[], state?: string }
 */

/**
 * Match a normalised GitHub event against a list of loaded pipelines.
 * Returns the first matching pipeline, or null if no rule matches.
 *
 * @param {{ type: string, labels: string[], state?: string }} event
 * @param {Pipeline[]} pipelines
 * @returns {Pipeline | null}
 */
export function matchEvent(event, pipelines) {
  for (const pipeline of pipelines) {
    const trigger = pipeline.trigger;

    // Event type must match exactly
    if (trigger.event !== event.type) continue;

    // All required labels must be present on the issue/PR
    if (trigger.labels && trigger.labels.length > 0) {
      const eventLabels = new Set(event.labels ?? []);
      const allPresent = trigger.labels.every(l => eventLabels.has(l));
      if (!allPresent) continue;
    }

    // Optional state predicate
    if (trigger.state && trigger.state !== event.state) continue;

    return pipeline;
  }

  return null;
}
