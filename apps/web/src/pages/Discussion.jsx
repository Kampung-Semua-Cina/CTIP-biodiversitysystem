// apps/web/src/pages/Discussion.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Mono, Pills } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { plantView } from "../../../shared/selectors.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";
import { fmtDate, fmtDateTime } from "../../../shared/utils.js";
import { go, useRoute } from "../useRoute.js";
import { useConfirm } from "../useConfirm.jsx";

// Discussion board for botanists, officers and admins. It works like email:
// the person who starts a thread chooses who it goes to (single people and/or
// whole groups by user type) and whether it is
//   private: only they and the people and groups it is sent to can read it, or
//   public:  every signed-in staff member can read and reply; the people and
//            groups it is sent to are the ones notified.
// Anyone in a thread can @mention someone who can read it, which notifies them.
// The database (RLS) decides who sees what; this page only shows what loaded.
//
// The older per-record comments still open at #/discussion/<observation id>
// and are listed under "Record comments".

const GROUPS = [
  { role: "botanist", label: "All botanists" },
  { role: "officer", label: "All conservation officers" },
  { role: "admin", label: "All administrators" },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.role, g.label]));

// People to share with and mention: the API's directory (names and roles of
// active accounts). Before the API sends one, officers and admins still have profiles.
function usePeople() {
  const { db, me } = useStore();
  return useMemo(() => {
    const list = db.directory?.length
      ? db.directory
      : (db.profiles || []).filter((p) => p.is_active !== false).map((p) => ({ id: p.id, full_name: p.full_name || p.email, username: p.username, role: p.role }));
    const byId = new Map(list.map((p) => [p.id, p]));
    if (me && !byId.has(me.id)) byId.set(me.id, { id: me.id, full_name: me.full_name || me.email, username: me.username, role: me.role });
    const all = [...byId.values()].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    return { all, byId, name: (id) => byId.get(id)?.full_name || "Former member" };
  }, [db.directory, db.profiles, me]);
}

// Everyone who can read a thread with this audience, owner included.
function readersOf({ visibility, users, roles, ownerId }, people) {
  if (visibility === "public") return people.all;
  return people.all.filter((p) => p.id === ownerId || users.includes(p.id) || roles.includes(p.role));
}

// Mentions still written in the text. Deleting "@Name" from the message un-tags them.
const keptMentions = (body, ids, people) => ids.filter((id) => body.includes("@" + people.name(id)));

export default function Discussion({ arg }) {
  const { db, me, role } = useStore();
  const people = usePeople();
  const { query } = useRoute();
  const [box, setBox] = useState("all");
  const [q, setQ] = useState("");
  const [composing, setComposing] = useState(!!query.obs);

  const threads = useMemo(() => (db.discussions || []).map((d) => {
    const posts = (db.discussionPosts || []).filter((p) => p.discussion_id === d.id);
    const audience = (db.discussionAudience || []).filter((a) => a.discussion_id === d.id);
    return { ...d, posts, audience };
  }), [db.discussions, db.discussionPosts, db.discussionAudience]);

  const unreadIds = new Set((db.notifications || [])
    .filter((n) => n.user_id === me?.id && !n.is_read && n.related_table === "discussions")
    .map((n) => n.related_id));

  // Old record comments, one topic per observation (botanists: their own).
  const visibleObs = db.observations.filter((o) => !o.is_deleted && (role !== "botanist" || o.recorded_by === me?.id));
  const recordTopic = (o) => {
    const plant = plantView(db, db.plants.find((p) => p.id === o.specimen_id));
    return { obs: o, plant, title: `${plant.name} · ${plant.qr_id}`, posts: db.comments.filter((c) => c.observation_id === o.id) };
  };

  if (arg) {
    const thread = threads.find((t) => t.id === arg);
    if (thread) return <Shell seg="discussion"><Thread thread={thread} people={people} /></Shell>;
    const obs = visibleObs.find((o) => o.id === arg);
    if (obs) return <Shell seg="discussion"><RecordTopic topic={recordTopic(obs)} /></Shell>;
    return (
      <Shell seg="discussion">
        <a href="#/discussion" className="backlink"><Icon name="chevL" size={16} /> All discussions</a>
        <MissingThread id={arg} />
      </Shell>
    );
  }

  const mentionsMe = (t) => t.posts.some((p) => (p.mentions || []).includes(me?.id));
  const sentToMe = (t) => t.owner_id !== me?.id && t.audience.some((a) => a.user_id === me?.id || a.role === role);
  const boxes = {
    all: () => true,
    inbox: (t) => sentToMe(t) || mentionsMe(t),
    mine: (t) => t.owner_id === me?.id,
    public: (t) => t.visibility === "public",
  };
  const recordTopics = visibleObs.map(recordTopic).filter((t) => t.posts.length)
    .sort((a, b) => b.posts.at(-1).created_at.localeCompare(a.posts.at(-1).created_at));

  const needle = q.trim().toLowerCase();
  const shown = box === "records" ? [] : threads
    .filter(boxes[box])
    .filter((t) => !needle || `${t.title} ${t.posts.map((p) => p.body).join(" ")}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.last_post_at || "").localeCompare(a.last_post_at || ""));
  const shownRecords = box !== "records" ? [] : recordTopics
    .filter((t) => !needle || `${t.title} ${t.posts.map((p) => p.body).join(" ")}`.toLowerCase().includes(needle));

  const count = (k) => threads.filter(boxes[k]).length;

  return (
    <Shell seg="discussion">
      <div className="row between wrap">
        <h2>Discussion</h2>
        {!composing && <button className="btn" onClick={() => setComposing(true)}><Icon name="plus" size={18} /> New discussion</button>}
      </div>
      <p className="mute">
        Start a thread and choose who it goes to: single people, whole groups such as all officers, or both.
        Private threads are only seen by the people you send them to. Public threads can be read by every staff member.
      </p>

      {composing && (
        <Composer
          people={people}
          observationId={query.obs || ""}
          observations={visibleObs.map(recordTopic)}
          onCancel={() => { setComposing(false); if (query.obs) go("/discussion"); }}
          onSent={(id) => { setComposing(false); go("/discussion/" + id); }}
        />
      )}

      <Pills
        label="Show"
        value={box}
        onChange={setBox}
        items={[
          { key: "all", label: "All", count: count("all") },
          { key: "inbox", label: "Sent to me", count: count("inbox") },
          { key: "mine", label: "Started by me", count: count("mine") },
          { key: "public", label: "Public", count: count("public") },
          { key: "records", label: "Record comments", count: recordTopics.length },
        ]}
      />

      <label className="search wide gap-top">
        <Icon name="search" size={18} />
        <input placeholder="Search discussions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search discussions" />
      </label>

      <ul className="plain notes gap-top">
        {shown.map((t) => {
          const last = t.posts.at(-1);
          const isNew = unreadIds.has(t.id);
          return (
            <li key={t.id}>
              <button className={"record topic" + (isNew ? " unread" : "")} onClick={() => go("/discussion/" + t.id)}>
                <span className="row wrap topichead">
                  <b>{t.title}</b>
                  <VisibilityChip value={t.visibility} />
                  {isNew && <span className="chip chip-synced">New</span>}
                </span>
                <span className="block mute small">To: {audienceText(t.audience, people) || "Everyone (public)"}</span>
                {last && <span className="block clamp2">{people.name(last.author_id)}: {last.body}</span>}
                <span className="meta">
                  <span>Started by {t.owner_id === me?.id ? "you" : people.name(t.owner_id)}</span>
                  <span>{t.posts.length} {t.posts.length === 1 ? "message" : "messages"}</span>
                  {last && <span>Last {fmtDateTime(last.created_at)}</span>}
                </span>
              </button>
            </li>
          );
        })}
        {shownRecords.map((t) => (
          <li key={t.obs.id}>
            <button className="record topic" onClick={() => go("/discussion/" + t.obs.id)}>
              <b>{t.plant.name}</b> <Mono className="mute">{t.plant.qr_id}</Mono>
              <span className="block clamp2">{t.posts[0].body}</span>
              <span className="meta">
                <span>{t.posts.length} {t.posts.length === 1 ? "comment" : "comments"}</span>
                <span>Last {fmtDateTime(t.posts.at(-1).created_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {box !== "records" && !shown.length && (
        <Empty icon="chat">{needle ? "No discussions match your search." : "No discussions here yet. Start one with New discussion."}</Empty>
      )}
      {box === "records" && !shownRecords.length && <Empty icon="chat">No record comments{needle ? " match your search" : " yet"}.</Empty>}
    </Shell>
  );
}

// "All officers, Alice Tan +2"
function audienceText(audience, people) {
  const groups = audience.filter((a) => a.role).map((a) => GROUP_LABEL[a.role]);
  const users = audience.filter((a) => a.user_id).map((a) => people.name(a.user_id));
  const all = [...groups, ...users];
  return all.length > 3 ? `${all.slice(0, 3).join(", ")} +${all.length - 3}` : all.join(", ");
}

function VisibilityChip({ value }) {
  return value === "public"
    ? <span className="chip chip-active"><Icon name="users" size={14} /> Public</span>
    : <span className="chip chip-officer"><Icon name="lock" size={14} /> Private</span>;
}

// A thread that is not loaded: just made, deleted, or no longer shared with you.
function MissingThread({ id }) {
  const { refreshDiscussion } = useStore();
  const [state, setState] = useState("loading");
  useEffect(() => {
    let live = true;
    refreshDiscussion(id).then(() => live && setState("gone"));
    return () => { live = false; };
  }, [id, refreshDiscussion]);
  return state === "loading"
    ? <p className="mute">Loading discussion…</p>
    : <Empty icon="lock">This discussion does not exist, was deleted, or has not been shared with you.</Empty>;
}

/* ---------------------------------------------------------------- compose */

function Composer({ people, observations, observationId, onCancel, onSent }) {
  const { me, notify, startDiscussion } = useStore();
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [obsId, setObsId] = useState(observationId);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState([]);
  const [sending, setSending] = useState(false);

  const readers = readersOf({ visibility, users, roles, ownerId: me?.id }, people);
  const linked = observations.find((t) => t.obs.id === obsId);

  const send = async (e) => {
    e.preventDefault();
    if (!title.trim()) return notify("Give the discussion a title");
    if (visibility === "private" && !users.length && !roles.length) return notify("Choose at least one person or group to send a private discussion to");
    if (!body.trim()) return notify("Write a message first");
    setSending(true);
    const readerIds = new Set(readers.map((p) => p.id));
    const id = await startDiscussion({
      title: title.trim(),
      body: body.trim(),
      visibility,
      share_users: users,
      share_roles: roles,
      mentions: keptMentions(body, mentions, people).filter((m) => readerIds.has(m)),
      observation_id: obsId || null,
    });
    setSending(false);
    if (id) onSent(id);
  };

  return (
    <form className="addform composer" onSubmit={send}>
      <h3><Icon name="chat" size={18} /> New discussion</h3>

      <label>Title<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="What is it about?" /></label>

      <VisibilityPicker value={visibility} onChange={setVisibility} />

      <AudiencePicker people={people} users={users} roles={roles} onUsers={setUsers} onRoles={setRoles} visibility={visibility} />

      <label>
        About a field record (optional)
        <select value={obsId} onChange={(e) => setObsId(e.target.value)}>
          <option value="">Not about a record</option>
          {[...observations]
            .sort((a, b) => b.obs.observed_at.localeCompare(a.obs.observed_at))
            .map((t) => <option key={t.obs.id} value={t.obs.id}>{t.title} · seen {fmtDate(t.obs.observed_at)}</option>)}
        </select>
      </label>
      {linked && visibility === "public" && (
        <p className="mute small">Everyone can read a public thread, including people who cannot open this record.</p>
      )}

      <MentionBox
        label="Message"
        value={body}
        onChange={setBody}
        mentions={mentions}
        onMentions={setMentions}
        candidates={readers.filter((p) => p.id !== me?.id)}
        placeholder="Write your message. Type @ to tag someone."
      />

      <p className="row wrap">
        <button className="btn" type="submit" disabled={sending}><Icon name="send" size={18} /> {sending ? "Sending…" : "Send"}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
        <span className="mute small">
          {visibility === "private"
            ? `${readers.length} ${readers.length === 1 ? "person" : "people"} will be able to read this, you included.`
            : "Every staff member will be able to read this."}
        </span>
      </p>
    </form>
  );
}

function VisibilityPicker({ value, onChange }) {
  const option = (key, icon, title, text) => (
    <label className={"visopt" + (value === key ? " on" : "")}>
      <input type="radio" name="visibility" value={key} checked={value === key} onChange={() => onChange(key)} />
      <Icon name={icon} size={18} />
      <span><b>{title}</b><small className="block mute">{text}</small></span>
    </label>
  );
  return (
    <fieldset className="visibility">
      <legend>Who can read it</legend>
      {option("private", "lock", "Private", "Only you and the people and groups you send it to.")}
      {option("public", "users", "Public", "Every signed-in staff member. The people and groups you choose are notified.")}
    </fieldset>
  );
}

// "Send to": whole groups by user type, and/or single people found by name.
function AudiencePicker({ people, users, roles, onUsers, onRoles, visibility }) {
  const { me } = useStore();
  const [find, setFind] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // Close on a click outside the box. Focus alone is not enough: the name you
  // pick disappears from the list, so the browser never says focus moved away.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const needle = find.trim().toLowerCase();
  const matches = people.all
    .filter((p) => p.id !== me?.id && !users.includes(p.id))
    .filter((p) => !needle || `${p.full_name} ${p.username || ""} ${ROLE_LABEL[p.role] || ""}`.toLowerCase().includes(needle))
    .slice(0, 8);
  const sizeOf = (r) => people.all.filter((p) => p.role === r && p.id !== me?.id).length;
  const toggleRole = (r) => onRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r]);
  // Back to the search box after a pick, so the next person can be typed straight away.
  const add = (id) => { onUsers([...users, id]); setFind(""); inputRef.current?.focus(); };

  return (
    <fieldset className="audience">
      <legend>Send to {visibility === "public" && <span className="mute">(optional for public threads)</span>}</legend>

      <p className="overline">Groups</p>
      <div className="pills" role="group" aria-label="Send to groups">
        {GROUPS.map((g) => (
          <button key={g.role} type="button" className={"pill" + (roles.includes(g.role) ? " on" : "")} aria-pressed={roles.includes(g.role)} onClick={() => toggleRole(g.role)}>
            {roles.includes(g.role) && <Icon name="check" size={14} />} {g.label}<b>{sizeOf(g.role)}</b>
          </button>
        ))}
      </div>

      <p className="overline gap-top">People</p>
      {users.length > 0 && (
        <ul className="plain tokens">
          {users.map((id) => (
            <li key={id} className="token">
              {people.name(id)} <small className="mute">{ROLE_LABEL[people.byId.get(id)?.role] || ""}</small>
              <button type="button" aria-label={`Remove ${people.name(id)}`} onClick={() => onUsers(users.filter((x) => x !== id))}><Icon name="x" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="suggest" ref={boxRef} onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <label className="search wide">
          <Icon name="user" size={18} />
          <input
            ref={inputRef}
            value={find}
            onChange={(e) => { setFind(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (matches[0]) add(matches[0].id); }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Add a person by name"
            aria-label="Add a person by name"
          />
        </label>
        {open && matches.length > 0 && (
          <ul className="popover suggestions" role="listbox">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" role="option" aria-selected="false" onClick={() => add(p.id)}>
                  <b>{p.full_name}</b> <small className="mute">{ROLE_LABEL[p.role]}{p.username ? ` · @${p.username}` : ""}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}

// A textarea that suggests people after "@". Picking one writes "@Full Name"
// and remembers their id, so the API can notify them.
function MentionBox({ label, value, onChange, mentions, onMentions, candidates, placeholder, rows = 4 }) {
  const ref = useRef(null);
  const [query, setQuery] = useState(null); // text after "@", or null when not mentioning
  const [pick, setPick] = useState(0);

  const needle = (query || "").toLowerCase();
  const options = query === null ? [] : candidates
    .filter((p) => `${p.full_name} ${p.username || ""}`.toLowerCase().includes(needle))
    .slice(0, 6);

  const update = (text, caret) => {
    onChange(text);
    const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
    setQuery(m ? m[1] : null);
    setPick(0);
  };

  const choose = (person) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${person.full_name} `);
    const text = before + value.slice(caret);
    onChange(text);
    if (!mentions.includes(person.id)) onMentions([...mentions, person.id]);
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };

  const onKeyDown = (e) => {
    if (!options.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setPick((pick + 1) % options.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPick((pick - 1 + options.length) % options.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[pick]); }
    else if (e.key === "Escape") setQuery(null);
  };

  return (
    <div className="suggest">
      <label>
        {label}
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          maxLength={5000}
          placeholder={placeholder}
          onChange={(e) => update(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
      </label>
      {options.length > 0 && (
        <ul className="popover suggestions" role="listbox" aria-label="People you can tag">
          {options.map((p, i) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={i === pick} className={i === pick ? "on" : ""}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                <b>{p.full_name}</b> <small className="mute">{ROLE_LABEL[p.role]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query !== null && !options.length && <p className="mute small">Nobody to tag by that name{candidates.length ? "" : ": only people who can read this thread can be tagged"}.</p>}
    </div>
  );
}

// A message with its @mentions picked out.
function Body({ text, mentions, people }) {
  const names = (mentions || []).map((id) => "@" + people.name(id)).sort((a, b) => b.length - a.length);
  if (!names.length) return <p>{text}</p>;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return <p>{parts.map((part, i) => (names.includes(part) ? <mark key={i} className="mention">{part}</mark> : part))}</p>;
}

/* ----------------------------------------------------------------- thread */

function Thread({ thread, people }) {
  const { db, me, role, markRead, replyToDiscussion, updateDiscussion, deleteDiscussion, refreshDiscussion } = useStore();
  const [ask, confirmDialog] = useConfirm();
  const [reply, setReply] = useState("");
  const [mentions, setMentions] = useState([]);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const isOwner = thread.owner_id === me?.id;

  const users = thread.audience.filter((a) => a.user_id).map((a) => a.user_id);
  const roles = thread.audience.filter((a) => a.role).map((a) => a.role);
  const readers = readersOf({ visibility: thread.visibility, users, roles, ownerId: thread.owner_id }, people);

  // Fresh copy when the thread opens. New messages after that arrive with the
  // site's live updates, which fetch only what changed.
  useEffect(() => {
    refreshDiscussion(thread.id);
  }, [thread.id, refreshDiscussion]);

  // Opening the thread reads its notifications.
  const asked = useRef(new Set());
  const unread = (db.notifications || []).filter((n) => n.user_id === me?.id && !n.is_read && n.related_table === "discussions" && n.related_id === thread.id);
  useEffect(() => {
    for (const n of unread) {
      if (asked.current.has(n.id)) continue;
      asked.current.add(n.id);
      markRead(n.id);
    }
  });

  const obs = thread.observation_id && db.observations.find((o) => o.id === thread.observation_id);
  const plant = obs && plantView(db, db.plants.find((p) => p.id === obs.specimen_id));

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    const readerIds = new Set(readers.map((p) => p.id));
    const ok = await replyToDiscussion(thread.id, reply.trim(), keptMentions(reply, mentions, people).filter((m) => readerIds.has(m)));
    setSending(false);
    if (ok) { setReply(""); setMentions([]); }
  };

  const remove = async () => {
    const ok = await ask({
      title: "Delete this discussion?",
      body: `"${thread.title}" and all ${thread.posts.length} messages in it will be deleted for everyone. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok && (await deleteDiscussion(thread.id))) go("/discussion");
  };

  return (
    <>
      <a href="#/discussion" className="backlink"><Icon name="chevL" size={16} /> All discussions</a>
      <div className="row between wrap">
        <h2 className="row wrap">{thread.title} <VisibilityChip value={thread.visibility} /></h2>
        <span className="row wrap">
          {isOwner && !editing && <button className="btn ghost" onClick={() => setEditing(true)}><Icon name="settings" size={16} /> Sharing</button>}
          {(isOwner || role === "admin") && <button className="btn ghost danger" onClick={remove}><Icon name="trash" size={16} /> Delete</button>}
        </span>
      </div>
      <p className="mute">
        Started by {isOwner ? "you" : people.name(thread.owner_id)} on {fmtDate(thread.created_at)}
        {plant && <> · about <a className="textlink" href={"#/tag/" + plant.qr_id}>{plant.name} <Mono>{plant.qr_id}</Mono></a></>}
      </p>
      <p className="small">
        <b>To:</b> {audienceText(thread.audience, people) || "nobody chosen"}
        {" · "}
        {thread.visibility === "public"
          ? "every staff member can read this"
          : `${readers.length} ${readers.length === 1 ? "person" : "people"} can read this`}
      </p>

      {editing && (
        <SharingEditor
          thread={thread}
          users={users}
          roles={roles}
          people={people}
          onClose={() => setEditing(false)}
          onSave={async (changes) => { if (await updateDiscussion(thread.id, changes)) setEditing(false); }}
        />
      )}

      <ul className="posts">
        {thread.posts.map((p) => {
          const author = people.byId.get(p.author_id);
          return (
            <li key={p.id} className={"post" + (p.author_id === me?.id ? " mine" : "")}>
              <header>
                <b>{author?.full_name || "Former member"}</b>
                {author && <Chip value={author.role}>{ROLE_LABEL[author.role]}</Chip>}
                <small className="mute">{fmtDateTime(p.created_at)}</small>
              </header>
              <Body text={p.body} mentions={p.mentions} people={people} />
            </li>
          );
        })}
      </ul>

      <form onSubmit={send}>
        <MentionBox
          label="Reply"
          value={reply}
          onChange={setReply}
          mentions={mentions}
          onMentions={setMentions}
          candidates={readers.filter((p) => p.id !== me?.id)}
          placeholder="Write a reply. Type @ to tag someone."
          rows={3}
        />
        <p><button className="btn" type="submit" disabled={sending || !reply.trim()}><Icon name="send" size={18} /> {sending ? "Sending…" : "Reply"}</button></p>
      </form>
      {confirmDialog}
    </>
  );
}

// Owner only: public or private, and who it is sent to.
function SharingEditor({ thread, users: startUsers, roles: startRoles, people, onClose, onSave }) {
  const { notify } = useStore();
  const [visibility, setVisibility] = useState(thread.visibility);
  const [users, setUsers] = useState(startUsers);
  const [roles, setRoles] = useState(startRoles);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (visibility === "private" && !users.length && !roles.length) return notify("A private discussion needs at least one person or group");
    setSaving(true);
    await onSave({ visibility, share_users: users, share_roles: roles });
    setSaving(false);
  };

  return (
    <form className="addform" onSubmit={save}>
      <h3><Icon name="settings" size={18} /> Sharing</h3>
      <VisibilityPicker value={visibility} onChange={setVisibility} />
      <AudiencePicker people={people} users={users} roles={roles} onUsers={setUsers} onRoles={setRoles} visibility={visibility} />
      <p className="mute small">People you add are notified. People you remove from a private thread can no longer read it.</p>
      <p className="row wrap">
        <button className="btn" type="submit" disabled={saving}><Icon name="check" size={18} /> {saving ? "Saving…" : "Save"}</button>
        <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
      </p>
    </form>
  );
}

/* ------------------------------------------------- older record comments */

// Every comment on one observation, oldest first, with a reply box.
function RecordTopic({ topic }) {
  const { db, me, addComment } = useStore();
  const people = usePeople();
  const [reply, setReply] = useState("");
  const { obs, plant, posts } = topic;

  const send = (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    addComment(obs.id, reply.trim());
    setReply("");
  };

  return (
    <>
      <a href="#/discussion" className="backlink"><Icon name="chevL" size={16} /> All discussions</a>
      <h2>{plant.name} <Mono className="mute">{plant.qr_id}</Mono></h2>
      <p className="mute">
        Record comments · recorded by {people.name(obs.recorded_by)} on {fmtDate(obs.observed_at)} · <Chip value={obs.status} />{" "}
        <a className="textlink" href={"#/tag/" + plant.qr_id}>View plant <Icon name="arrowR" size={16} /></a>{" "}
        <a className="textlink" href={"#/discussion?obs=" + obs.id}>Start a discussion about it <Icon name="arrowR" size={16} /></a>
      </p>

      <ul className="posts">
        {posts.map((c) => {
          const author = people.byId.get(c.author_id) || db.profiles.find((p) => p.id === c.author_id);
          return (
            <li key={c.id} className={"post" + (c.author_id === me?.id ? " mine" : "")}>
              <header>
                <b>{author?.full_name || "Unknown"}</b>
                {author && <Chip value={author.role}>{ROLE_LABEL[author.role]}</Chip>}
                <small className="mute">{fmtDateTime(c.created_at)}</small>
              </header>
              <p>{c.body}</p>
            </li>
          );
        })}
        {!posts.length && <li className="mute">No comments yet. Write the first one below.</li>}
      </ul>

      <form onSubmit={send}>
        <label>{posts.length ? "Reply" : "Comment"}<textarea rows="3" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" /></label>
        <p><button className="btn" type="submit"><Icon name="send" size={18} /> {posts.length ? "Reply" : "Post"}</button></p>
      </form>
    </>
  );
}
