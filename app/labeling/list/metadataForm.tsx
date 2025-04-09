"use client";

import React, { useEffect, useState } from "react";

import brandOptions from "@/app/constants/brandOptions";
import colorOptions from "@/app/constants/colorOptions";
import materialOptions from "@/app/constants/materialOptions";
import modifierOptions from "@/app/constants/modifierOptions";
import shapeOptions from "@/app/constants/shapeOptions";

interface MetadataFormProps {
  metadata: Record<string, any>;
  onMetadataChange: (updated: Record<string, any>) => void;
}

/**
 * Renders brand/color/material/shape/modifier fields, plus a pick_point read-only.
 * We keep "No brand" as value: "", but also let the user pick "Other (Specify Below)" -> "Other".
 */
export default function MetadataForm({
  metadata,
  onMetadataChange,
}: MetadataFormProps) {
  const [localMeta, setLocalMeta] = useState<Record<string, any>>({});
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  useEffect(() => {
    // Sync local state with the incoming 'metadata'
    setLocalMeta(metadata);

    // Decide if brand is recognized or custom
    const brandVal = metadata.brand ?? "";
    const isInList = brandOptions.some((b) => b.value === brandVal);
    if (brandVal === "Other") {
      setIsCustomBrand(true);
    } else if (!isInList && brandVal !== "") {
      setIsCustomBrand(true);
    } else {
      setIsCustomBrand(false);
    }
  }, [metadata]);

  /** Helper to update local + notify parent */
  function handleFieldChange(field: string, value: string) {
    const updated = { ...localMeta, [field]: value };
    setLocalMeta(updated);
    onMetadataChange(updated);
  }

  /** When user picks from the brand <select> */
  function handleBrandSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === "Other") {
      setIsCustomBrand(true);
      handleFieldChange("brand", "Other");
    } else {
      setIsCustomBrand(false);
      handleFieldChange("brand", val);
    }
  }

  /** For the user to type a custom brand */
  function handleCustomBrandChange(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value;
    handleFieldChange("brand", typed);
  }

  /** multi-check modifiers (always visible now, no dropdown) */
  function handleModifierChange(modVal: string, checked: boolean) {
    const curr = localMeta.modifier || "";
    const arr = curr ? curr.split(", ") : [];
    if (checked) {
      arr.push(modVal);
    } else {
      const idx = arr.indexOf(modVal);
      if (idx > -1) arr.splice(idx, 1);
    }
    handleFieldChange("modifier", arr.join(", "));
  }

  const selectedMods = localMeta.modifier ? localMeta.modifier.split(", ") : [];

  return (
    <div style={{ marginTop: "8px" }}>
      {/* Brand */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Brand:</label>

        <select
          value={
            localMeta.brand === "Other"
              ? "Other"
              : brandOptions.some((b) => b.value === localMeta.brand)
              ? localMeta.brand
              : localMeta.brand === ""
              ? ""
              : "Other"
          }
          onChange={handleBrandSelect}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          {brandOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {isCustomBrand && (
          <input
            type="text"
            placeholder="Custom brand"
            style={{
              marginLeft: "6px",
              padding: "4px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
            value={
              localMeta.brand === "Other" ? "" : (localMeta.brand || "")
            }
            onChange={handleCustomBrandChange}
          />
        )}
      </div>

      {/* Color */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Color:</label>
        <select
          value={localMeta.color || ""}
          onChange={(e) => handleFieldChange("color", e.target.value)}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {colorOptions.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Material */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Material:</label>
        <select
          value={localMeta.material || ""}
          onChange={(e) => handleFieldChange("material", e.target.value)}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {materialOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Shape */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Shape:</label>
        <select
          value={localMeta.shape || ""}
          onChange={(e) => handleFieldChange("shape", e.target.value)}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {shapeOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Modifiers - always visible checkboxes in a grid */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>
          Modifiers:
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: "6px",
            marginLeft: "6px",
            marginTop: "4px",
          }}
        >
          {modifierOptions.map((m) => {
            const checked = selectedMods.includes(m.value);
            return (
              <label
                key={m.value}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontSize: "14px",
                  background: "#f9f9f9",
                  borderRadius: "4px",
                  padding: "4px",
                  border: "1px solid #ccc",
                }}
              >
                <input
                  type="checkbox"
                  style={{ marginRight: "6px" }}
                  checked={checked}
                  onChange={(e) =>
                    handleModifierChange(m.value, e.target.checked)
                  }
                />
                {m.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Pick Point (read-only) */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: "6px", fontWeight: "bold" }}>
          Pick Point:
        </label>
        <input
          type="text"
          readOnly
          style={{
            width: "80px",
            background: "#f5f5f5",
            borderRadius: "4px",
            border: "1px solid #ccc",
            padding: "4px",
            cursor: "not-allowed",
          }}
          value={localMeta.pick_point || ""}
        />
      </div>
    </div>
  );
}
