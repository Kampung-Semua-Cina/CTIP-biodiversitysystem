// web/src/pages/Discussion.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { nameOf, plantView } from "../selectors.js";
import { ROLE_LABEL } from "../permissions.js";
import { fmtDate, fmtDateTime } from "../utils.js";
import { go } from "../useRoute.js";

// Discussion board for botanists, officers and admins, built on observation_comments.
// That table has no parent column, so each observation is one topic: the first comment
// starts the topic and every later comment on the same observation is a reply.
// Who sees what matches the database rules: botanists see topics on their own
// observations, officers and admins see every topic.
export default function Discussion({ arg }) {
  const { db, me, role } = useStore();
  const [q, setQ] = useState("");

  const visible = db.observations.filter((o) => !o.is_deleted && (role !== "botanist" || o.recorded_by === me.id));
  const describe = (o) => {
    const plant = plantView(db, db.plants.find((p) => p.id === o.specimen_id));
    return { obs: o, plant, title: `${plant.name} · ${plant.qr_id}`, posts: db.comments.filter((c) => c.observation_id === o.id) };
  };

  const topics = visible
    .map(describe)
    .filter((t) => t.posts.length)
    .sort((a, b) => b.posts.at(-1).created_at.localeCompare(a.posts.at(-1).created_at));
  const shown = topics.filter((t) =>
    `${t.title} ${t.posts.map((p) => p.body).join(" ")}`.toLowerCase().includes(q.toLowerCase()),
  );

  const open = arg && visible.find((o) => o.id === arg);
  if (open) return <Shell seg="discussion"><Topic topic={describe(open)} /></Shell>;

  return (
    <Shell seg="discussion">
      <h2>Discussion</h2>
      <p className="mute">
        Ask questions and talk through field records with the team. Each topic is about one observation.
        {role === "botanist" && " You see topics on your own observations."}
      </p>

      <NewTopic observations={visible.map(describe)} />

      <label className="search wide">
        <Icon name="search" size={18} />
        <input placeholder="Search topics" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search topics" />
      </label>

      <ul className="plain notes gap-top">
        {shown.map((t) => {
          const last = t.posts.at(-1);
          return (
            <li key={t.obs.id}>
              <button className="record topic" onClick={() => go("/discussion/" + t.obs.id)}>
                <b>{t.title}</b>
                <span className="block">{t.posts[0].body}</span>
                <span className="meta">
                  <span>Started by {nameOf(db, t.posts[0].author_id)}</span>
                  <span>{t.posts.length - 1} {t.posts.length === 2 ? "reply" : "replies"}</span>
                  <span>Last post {fmtDateTime(last.created_at)} by {nameOf(db, last.author_id)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!shown.length && <Empty icon="chat">{topics.length ? "No topics match your search." : "No topics yet. Start one above."}</Empty>}
    </Shell>
  );
}

// "New post": pick the observation the topic is about and write the first message.
function NewTopic({ observations }) {
  const { addComment, notify } = useStore();
  const [obsId, setObsId] = useState("");
  const [body, setBody] = useState("");

  const post = (e) => {
    e.preventDefault();
    if (!obsId) return notify("Choose which observation the topic is about");
    if (!body.trim()) return notify("Write a message first");
    addComment(obsId, body.trim());
    setBody("");
    notify("Posted");
    go("/discussion/" + obsId);
  };

  return (
    <form className="addform" onSubmit={post}>
      <h3 className="sub"><Icon name="plus" size={18} /> New post</h3>
      <label>
        Observation
        <select value={obsId} onChange={(e) => setObsId(e.target.value)}>
          <option value="">Choose an observation</option>
          {observations
            .sort((a, b) => b.obs.observed_at.localeCompare(a.obs.observed_at))
            .map((t) => (
              <option key={t.obs.id} value={t.obs.id}>{t.title} · seen {fmtDate(t.obs.observed_at)}</option>
            ))}
        </select>
      </label>
      <label>Message<textarea rows="3" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ask a question or share an update" /></label>
      <p><button className="btn" type="submit">Post</button></p>
    </form>
  );
}

// One topic: every comment on the observation, oldest first, with a reply box.
function Topic({ topic }) {
  const { db, me, addComment, notify } = useStore();
  const [reply, setReply] = useState("");
  const { obs, plant, title, posts } = topic;

  const send = (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    addComment(obs.id, reply.trim());
    setReply("");
    notify("Reply posted");
  };

  return (
    <>
      <a href="#/discussion" className="small"><Icon name="chevL" size={14} /> All topics</a>
      <h2>{title}</h2>
      <p className="mute">
        Observation recorded by {nameOf(db, obs.recorded_by)} on {fmtDate(obs.observed_at)} · <Chip value={obs.status} />{" "}
        <a href={"#/dashboard/" + plant.qr_id}>View plant</a>
      </p>

      <ul className="posts">
        {posts.map((c, i) => {
          const author = db.profiles.find((p) => p.id === c.author_id);
          return (
            <li key={c.id} className={"post" + (c.author_id === me.id ? " mine" : "")}>
              <header>
                <b>{author?.full_name || "Unknown"}</b>
                {author && <Chip value={author.role}>{ROLE_LABEL[author.role]}</Chip>}
                <small className="mute">{i === 0 ? "posted" : "replied"} {fmtDateTime(c.created_at)}</small>
              </header>
              <p>{c.body}</p>
            </li>
          );
        })}
        {!posts.length && <li className="mute">No posts yet. Write the first one below.</li>}
      </ul>

      <form onSubmit={send}>
        <label>{posts.length ? "Reply" : "Message"}<textarea rows="3" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" /></label>
        <p><button className="btn" type="submit">{posts.length ? "Reply" : "Post"}</button></p>
      </form>
    </>
  );
}
