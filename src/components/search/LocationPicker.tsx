"use client";

import Autocomplete from "@mui/material/Autocomplete";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useEffect, useState } from "react";
import { Building2, Flag, Globe2, MapPin, X } from "lucide-react";
import { api } from "@/lib/client/api";
import type { LocationQuery } from "@/lib/jobs/types";

export interface LocationChoice {
  query: LocationQuery;
  label: string;
  detail: string;
}

interface Suggestion {
  type: "city" | "country" | "region";
  label: string;
  detail: string;
  city?: string;
  countryCode?: string;
  regionId?: string;
}

const ICON = { city: Building2, country: Flag, region: Globe2 };

export function toChoice(s: Suggestion): LocationChoice {
  const query: LocationQuery =
    s.type === "city" ? { type: "city", city: s.city!, countryCode: s.countryCode! } : s.type === "country" ? { type: "country", countryCode: s.countryCode! } : { type: "region", regionId: s.regionId! };
  return { query, label: s.label, detail: s.detail };
}

/** Required location: city, country or region, with suggestions from the server. */
export function LocationPicker({ value, onChange }: { value: LocationChoice | null; onChange: (v: LocationChoice | null) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      setLoading(true);
      api<{ suggestions: Suggestion[] }>(`/api/jobs/locations?q=${encodeURIComponent(q)}`)
        .then((r) => setItems(r.suggestions))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    const Icon = ICON[value.query.type];
    return (
      <div className="flex h-10 items-center gap-2 rounded-[10px] border border-brand bg-brand-soft/50 px-3">
        <Icon className="size-4 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{value.label}</span> <span className="text-muted">· {value.detail}</span>
        </span>
        <button className="rounded p-1 text-muted hover:bg-black/5 hover:text-ink" aria-label="Change location" onClick={() => onChange(null)}>
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <Autocomplete<Suggestion>
      options={q.trim().length >= 2 ? items : []}
      filterOptions={(x) => x}
      getOptionLabel={(o) => `${o.label}, ${o.detail}`}
      isOptionEqualToValue={(a, b) => a.label === b.label && a.detail === b.detail}
      onInputChange={(_, v) => setQ(v)}
      onChange={(_, v) => v && onChange(toChoice(v))}
      loading={loading}
      noOptionsText={q.trim().length < 2 ? "Type at least 2 letters" : "No matching place"}
      openOnFocus={false}
      autoHighlight
      renderOption={(props, o) => {
        const Icon = ICON[o.type];
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <li key={key} {...rest} className={`${rest.className ?? ""} flex items-center gap-2.5`}>
            <Icon className="size-4 text-muted" aria-hidden />
            <span className="flex-1 font-medium">{o.label}</span>
            <span className="text-xs text-muted">{o.detail}</span>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="City, country or region — e.g. Oulu, Finland, Europe"
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, "aria-label": "Location (required)" },
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <MapPin className="size-4 text-muted" aria-hidden />
                </InputAdornment>
              ),
            },
          }}
          sx={{ bgcolor: "background.paper" }}
        />
      )}
    />
  );
}
