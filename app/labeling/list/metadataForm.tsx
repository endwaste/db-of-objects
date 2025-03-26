"use client";

import React, { useEffect, useRef, useState } from "react";

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
 * If brand is "Other" or is an unrecognized string, we show a custom brand text input
 * that remains visible even if user clears the text (unless they select "No brand" from the list).
 */
export default function MetadataForm({
  metadata,
  onMetadataChange,
}: MetadataFormProps) {
  const [localMeta, setLocalMeta] = useState<Record<string, any>>({});
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  // For the modifier dropdown
  const [showModifierDropdown, setShowModifierDropdown] = useState(false);
  const modifierDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1) sync local state with the incoming 'metadata'
    setLocalMeta(metadata);

    // 2) decide if brand is recognized or custom
    const brandVal = metadata.brand ?? "";
    // brandOptions has: { value: "", label: "No brand" }, etc.
    // We find if brandVal is in the list
    const isInList = brandOptions.some((b) => b.value === brandVal);

    if (brandVal === "Other") {
      // user specifically has "Other" => show custom box
      setIsCustomBrand(true);
    } else if (!isInList && brandVal !== "") {
      // brand is not recognized, and it's not empty => custom typed brand => show box
      setIsCustomBrand(true);
    } else {
      // recognized brand or empty => no custom brand
      setIsCustomBrand(false);
    }
  }, [metadata]);

  useEffect(() => {
    // close modifiers on outside click
    function handleClickOutside(e: MouseEvent) {
      if (
        modifierDropdownRef.current &&
        !modifierDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModifierDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      // user wants to pick "Other"
      setIsCustomBrand(true);
      // keep brand as "Other" so the dropdown remains at "Other"
      handleFieldChange("brand", "Other");
    } else {
      // recognized brand or empty => no custom brand
      setIsCustomBrand(false);
      handleFieldChange("brand", val);
    }
  }

  /** For the user to type a custom brand */
  function handleCustomBrandChange(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value;
    handleFieldChange("brand", typed);
  }

  /** multi-check modifiers */
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
          // if brand is "Other" or an unrecognized custom string => show "Other" in the dropdown
          // but we only literally pick "Other" if brandVal is exactly "Other"
          value={
            // if the brand is "Other" => user selected "Other"
            // if brand is recognized => that brand
            // if brand is unrecognized + not empty => keep "Other"
            localMeta.brand === "Other"
              ? "Other"
              : brandOptions.some((b) => b.value === localMeta.brand)
              ? // recognized brand
                localMeta.brand
              : // brand is unrecognized or empty => treat as empty or "no brand"
                localMeta.brand === ""
              ? ""
              : // unrecognized => "Other"
                "Other"
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
            // if brand is literally "Other", we show an empty text field or user typed text
            // if brand is typed => localMeta.brand
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

      {/* Modifiers Dropdown */}
      <div style={{ marginBottom: "8px", position: "relative" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Modifiers:</label>
        <button
          type="button"
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#f9f9f9",
            cursor: "pointer",
          }}
          onClick={() => setShowModifierDropdown((prev) => !prev)}
        >
          {selectedMods.length > 0
            ? selectedMods.join(", ")
            : "Select Modifiers..."}
        </button>
        {showModifierDropdown && (
          <div
            ref={modifierDropdownRef}
            style={{
              position: "absolute",
              zIndex: 999,
              top: "100%",
              left: 0,
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "6px",
              width: "200px",
              marginTop: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            {modifierOptions.map((m) => {
              const checked = selectedMods.includes(m.value);
              return (
                <label
                  key={m.value}
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: "4px" }}
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
        )}
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
