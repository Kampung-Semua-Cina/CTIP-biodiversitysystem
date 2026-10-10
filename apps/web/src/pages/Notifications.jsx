// web/src/pages/Notifications.jsx
import { useStore } from "../store.js";
import { Empty } from "../components/Bits.jsx";
import { fmtDateTime } from "../utils.js";
import { go } from "../useRoute.js";

// The bell: notifications for the signed-in person (notifications table).
export default function Notifications() {
  const { db, me, role, markRead, markAllRead } = useStore();
  const mine = db.notifications
    .filter((n) => n.user_id === me.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = mine.filter((n) => !n.is_read).length;

  const open = (n) => {
    markRead(n.id);
    if (n.related_table === "alerts") go("/monitoring");
    else if (n.type === "comment_reply") go("/discussion/" + n.related_id);
    else if (role === "botanist") go("/records");
    else if (role === "officer") go("/review");
  };

  return (
    <section className="glass pad narrow wide-form">
      <div className="row between wrap">
        <h2>Notifications</h2>
        {unread > 0 && <button className="btn ghost" onClick={markAllRead}>Mark all as read</button>}
      </div>
      {mine.length === 0 && <Empty icon="bell">You have no notifications.</Empty>}
      <ul className="plain notes">
        {mine.map((n) => (
          <li key={n.id}>
            <button className={"note" + (n.is_read ? "" : " unread")} onClick={() => open(n)}>
              <b>{n.title}</b>
              <span>{n.body}</span>
              <small className="mute">{fmtDateTime(n.created_at)}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
