"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, X, Plus } from "lucide-react";

interface KeywordSavePanelProps {
  siteId: string;
  query: string;
  initialSaved: boolean;
  initialTags: string[];
  initialNotes: string;
}

export function KeywordSavePanel({
  siteId,
  query,
  initialSaved,
  initialTags,
  initialNotes,
}: KeywordSavePanelProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [notes, setNotes] = useState(initialNotes);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setTagInput("");
      return;
    }
    setTags([...tags, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function persist(nextTags: string[], nextNotes: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/saved-keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          notes: nextNotes.trim() || undefined,
          tags: nextTags,
        }),
      });
      if (!res.ok) throw new Error("Failed to save keyword");
      setSaved(true);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function unsave() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/saved-keywords`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error("Failed to remove keyword");
      setSaved(false);
      setTags([]);
      setNotes("");
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
            Tracking
          </h3>
          <p className="text-atom-caption text-muted-foreground">
            {saved ? "Saved to your tracked keywords" : "Not tracked yet"}
          </p>
        </div>
        {saved ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={unsave}
            disabled={loading}
            className="text-danger hover:bg-danger/10"
          >
            <BookmarkCheck className="size-3.5" />
            Saved
          </Button>
        ) : (
          <Button size="sm" onClick={() => persist(tags, notes)} disabled={loading}>
            <Bookmark className="size-3.5" />
            Save keyword
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Tags
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-primary/70 transition hover:text-primary"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Add tag"
                className="h-7 w-24 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {tagInput.trim() && (
                <button
                  type="button"
                  onClick={() => addTag(tagInput)}
                  className="rounded-full p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                  aria-label="Add tag"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Target page, intent…"
            className="h-8 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <Button
          size="sm"
          onClick={() => persist(tags, notes)}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Saving…" : saved ? "Update tags & notes" : "Save keyword"}
        </Button>
      </div>
    </div>
  );
}
