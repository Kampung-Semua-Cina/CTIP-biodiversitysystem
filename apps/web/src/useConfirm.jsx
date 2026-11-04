// apps/web/src/useConfirm.jsx
import { useCallback, useState } from "react";
import { ConfirmDialog } from "./components/Bits.jsx";

// const [ask, confirmDialog] = useConfirm();
// if (!(await ask({ title, body, confirmLabel, danger, word }))) return;   // ...and render {confirmDialog}
export function useConfirm() {
  const [req, setReq] = useState(null);
  const ask = useCallback(({ body, ...opts }) => new Promise((resolve) => setReq({ ...opts, body, resolve })), []);
  const done = (ok) => {
    req.resolve(ok);
    setReq(null);
  };
  const dialog = req ? (
    <ConfirmDialog title={req.title} confirmLabel={req.confirmLabel} danger={req.danger} word={req.word} onConfirm={() => done(true)} onCancel={() => done(false)}>
      {typeof req.body === "string" ? <p>{req.body}</p> : req.body}
    </ConfirmDialog>
  ) : null;
  return [ask, dialog];
}
