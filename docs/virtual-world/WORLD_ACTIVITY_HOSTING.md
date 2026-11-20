# UCENO World Activity Hosting and Disconnect Policy

## Host authority

- The gateway stores the activity host identity and includes it in activity-state broadcasts.
- Only the current host can start or cancel an activity.
- A host departure does not leave a lobby permanently locked: ownership transfers to the earliest remaining joined participant, ordered by join timestamp and then user ID for deterministic tie-breaking.
- If the departing host has no remaining joined participant to inherit the session, the gateway cancels the activity and broadcasts the terminal state.
- A disconnected participant is marked left while a lobby is open, or DNF after the activity has started.
- Clients cannot nominate a replacement host or alter participant finish/checkpoint state.

## Scope and limitation

Activity sessions are still scoped to a live gateway process. The gateway currently clears in-memory sessions and results on process restart. This host succession change improves disconnect handling but does not provide cross-restart persistence or cross-instance activity migration.

## Automated coverage

The gateway activity-session suite checks deterministic replacement selection and the no-successor case. The gateway WebSocket path applies the result when the current host disconnects and broadcasts the updated host/state.
