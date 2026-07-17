"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GSCProperty {
  siteUrl: string;
  permissionLevel: string;
}

export function AddSiteModal({
  triggerLabel = "Add site",
}: {
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<GSCProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (newOpen) {
      setSuccess(false);
      setError("");
      if (properties.length === 0) {
        await loadGSCProperties();
      }
    }
  }

  async function loadGSCProperties() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/gsc/properties");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load GSC properties");
      }

      const data = (await response.json()) as GSCProperty[];
      setProperties(data || []);

      if (!data?.length) {
        setError(
          "No GSC properties found. Verify this Google account has Search Console access."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load GSC properties"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSite() {
    if (!selectedProperty) {
      setError("Select a property first");
      return;
    }

    setAdding(true);
    setError("");

    try {
      let domain = selectedProperty;
      if (domain.includes(":")) {
        domain = domain.split(":")[1];
      }
      // URL-prefix properties: https://example.com/
      try {
        if (domain.startsWith("http")) {
          domain = new URL(domain).hostname;
        }
      } catch {
        // keep as-is
      }

      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          gscProperty: selectedProperty,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Failed to add site");
      }

      setSuccess(true);
      setSelectedProperty("");
      router.refresh();

      setTimeout(() => {
        setOpen(false);
        if (body.id) {
          router.push(`/sites/${body.id}`);
        }
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add site");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-primary text-primary-foreground hover:brightness-110" />
        }
      >
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Search Console</DialogTitle>
          <DialogDescription>
            Pick a property you manage. We only request read-only GSC access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-signal/30 bg-signal-muted px-3 py-2 text-sm text-signal">
              Site connected. Opening workspace…
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading properties from Google…
            </div>
          ) : properties.length > 0 ? (
            <Select
              value={selectedProperty}
              onValueChange={(value) => value !== null && setSelectedProperty(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a GSC property…" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((prop) => (
                  <SelectItem key={prop.siteUrl} value={prop.siteUrl}>
                    {prop.siteUrl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddSite}
              disabled={!selectedProperty || loading || adding}
              className="bg-primary text-primary-foreground hover:brightness-110"
            >
              {adding ? "Connecting…" : "Connect site"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
