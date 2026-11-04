// apps/web/src/decisionPrompt.jsx
// Text for the confirm popup shown before an officer approves, returns or rejects a record.
// Approving puts the plant in front of the public, so it needs a typed word; the others a click.
export function decisionPrompt(decision, qrId, { hidden = false, hasCoords = true, speciesPublished = true } = {}) {
  if (decision === "approve") {
    return {
      title: "Approve & publish",
      confirmLabel: "Approve & publish",
      word: "PUBLISH",
      body: (
        <>
          <p>Approve <b>{qrId}</b> and publish it to the plant library? Visitors will be able to see it.</p>
          {hasCoords && <p className="mute small">{hidden ? "Its exact location stays hidden from the public." : "Its exact location will be shown on the public map."}</p>}
          {!speciesPublished && <p className="mute small">Its species is not published yet, so visitors will not see it until the species is.</p>}
        </>
      ),
    };
  }
  if (decision === "return") {
    return { title: "Return for changes", confirmLabel: "Return to botanist", body: `Send ${qrId} back to the botanist with your note?` };
  }
  return { title: "Reject record", confirmLabel: "Reject record", danger: true, body: `Reject ${qrId}? It will not be published, and the botanist is told why.` };
}
