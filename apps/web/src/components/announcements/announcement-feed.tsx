"use client";

import {onAuthStateChanged} from "firebase/auth";
import {collection, limit, onSnapshot, orderBy, query, where} from "firebase/firestore";
import {useEffect, useRef, useState} from "react";
import {auth, db} from "@/lib/firebase/client";
import {publishedAnnouncement, type PublishedAnnouncement} from "@/lib/announcements/announcement";
import {Button} from "@/components/ui/button";
import {Megaphone, ChevronRight} from "lucide-react";

export function AnnouncementFeed({role, compact = false, onAvailability, onNew}: {
  role: "customer" | "provider";
  compact?: boolean;
  onAvailability?: (count: number) => void;
  onNew?: () => void;
}) {
  const callbacks = useRef({onAvailability, onNew});
  useEffect(() => {callbacks.current = {onAvailability, onNew};});
  const [items, setItems] = useState<PublishedAnnouncement[]>([]);
  const [count, setCount] = useState(10);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let stop = () => {};
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stop();
      const current = ++generation;
      let seen: Set<string> | null = null;
      callbacks.current.onAvailability?.(0);
      setItems([]); setMore(false); setError(false); setLoading(true);
      if (!user) {setLoading(false); setError(true); return;}
      stop = onSnapshot(query(collection(db, "announcements"),
        where("status", "==", "published"), where("isDeleted", "==", false),
        where("audience", "in", ["everyone", role === "customer" ? "customers" : "providers"]),
        orderBy("publishedAt", "desc"), limit(count + 1)), (snapshot) => {
        if (current !== generation) return;
        const nextItems = snapshot.docs.slice(0, count).flatMap((doc) => {
          const item = publishedAnnouncement(doc.id, doc.data(), role);
          return item ? [item] : [];
        });
        if (seen && nextItems.some((item) => !seen!.has(item.id))) callbacks.current.onNew?.();
        seen = new Set([...(seen ?? []), ...nextItems.map((item) => item.id)]);
        setItems(nextItems);
        callbacks.current.onAvailability?.(nextItems.length);
        setMore(snapshot.size > count); setLoading(false); setError(false);
      }, () => {if (current !== generation) return; callbacks.current.onAvailability?.(0); setItems([]); setMore(false); setError(true); setLoading(false);});
    });
    return () => {generation++; stopAuth(); stop();};
  }, [role, count, retry]);
  if (compact) return <section aria-label="Official announcement previews" className="border-b border-border p-4">
    <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Megaphone aria-hidden="true" className="size-4" />Official announcements</h3>
    {loading ? <p className="text-sm">Loading announcements…</p> : error ? <p role="alert" className="text-sm">Announcements unavailable. Open Official announcements to retry.</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">No published announcements.</p> : <div className="grid gap-2">{items.slice(0, 3).map((item) => <a key={item.id} href={`/${role}/notifications#official-announcements`} className="group flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="min-w-0 flex-1">
        <span className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground"><span className="rounded-full bg-card px-2 py-0.5 font-semibold text-primary">{item.audience === "everyone" ? "Everyone" : role === "customer" ? "Customers" : "Providers"}</span><span>{item.publishedAt.toLocaleDateString("en-PH", {month: "short", day: "numeric", timeZone: "Asia/Manila"})}</span></span>
        <span className="block break-words font-bold leading-5 text-primary">{item.title}</span>
        <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{item.content}</span>
      </span>
      <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
    </a>)}</div>}
  </section>;
  return <section aria-labelledby="official-announcements" className="grid gap-3 rounded-card border border-border bg-card p-5">
    <h2 id="official-announcements" className="text-xl font-bold">Official announcements</h2>
    <p className="text-sm text-muted-foreground">Updates for everyone and {role === "customer" ? "customers" : "providers"}. Separate from your personal notifications.</p>
    {loading ? <p role="status">Loading announcements…</p> : error ? <div role="alert"><p>Announcements could not be loaded. Please check your connection and sign-in.</p><Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>Retry announcements</Button></div> : items.length === 0 ? <p>No published announcements for you right now.</p> : items.map((item) => <article key={item.id} className="rounded-xl border border-border p-4">
      <h3 className="font-bold">{item.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{item.audience === "everyone" ? "Everyone" : role === "customer" ? "Customers" : "Providers"} · {item.publishedAt.toLocaleString("en-PH", {timeZone: "Asia/Manila"})}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.content}</p>
    </article>)}
    {!loading && !error && more ? <Button variant="secondary" onClick={() => setCount((value) => value + 10)}>Show more announcements</Button> : null}
  </section>;
}
