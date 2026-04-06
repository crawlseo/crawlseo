"use client";

import { useState } from "react";
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

export function AddSiteModal() {
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<GSCProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  async function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);

    if (newOpen && properties.length === 0) {
      await loadGSCProperties();
    }
  }

  async function loadGSCProperties() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/gsc/properties");

      if (!response.ok) {
        throw new Error("Failed to load GSC properties");
      }

      const data = (await response.json()) as GSCProperty[];
      setProperties(data || []);

      if (data.length === 0) {
        setError(
          "No GSC properties found. Please verify your Google Search Console account."
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
      setError("Please select a property");
      return;
    }

    setAdding(true);
    setError("");

    try {
      // Extract domain from siteUrl (e.g., "sc-domain:example.com" -> "example.com")
      let domain = selectedProperty;
      if (domain.includes(":")) {
        domain = domain.split(":")[1];
      }

      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          gscProperty: selectedProperty,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add site");
      }

      setSuccess(true);
      setSelectedProperty("");

      // Close modal and refresh after a short delay
      setTimeout(() => {
        setOpen(false);
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add site");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          Add Site
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Google Search Console Site</DialogTitle>
          <DialogDescription>
            Select a Google Search Console property to connect to CrawlSEO
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
              Site added successfully! Syncing data...
            </div>
          )}

          {loading ? (
            <div className="text-center py-6">
              <p className="text-slate-600">Loading GSC properties...</p>
            </div>
          ) : properties.length > 0 ? (
            <Select value={selectedProperty} onValueChange={(value) => value !== null && setSelectedProperty(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a GSC property..." />
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

          <div className="flex gap-3 justify-end pt-4">
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
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {adding ? "Adding..." : "Add Site"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
