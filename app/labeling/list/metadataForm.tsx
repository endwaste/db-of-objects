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
 * If brand is "Other" or not recognized, we show a custom brand input.
 */
export default function MetadataForm({
  metadata,
  onMetadataChange,
}: MetadataFormProps) {
  const [localMeta, setLocalMeta] = useState<Record<string, any>>(metadata);
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  // For the modifier dropdown
  const [showModifierDropdown, setShowModifierDropdown] = useState(false);
  const modifierDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalMeta(metadata);

    // Decide if brand is "Other" or unrecognized
    if (!metadata.brand) {
      setIsCustomBrand(false);
    } else {
      const knownOption = brandOptions.find((b) => b.value === metadata.brand);
      if (!knownOption || knownOption.value === "Other") {
        setIsCustomBrand(true);
      } else {
        setIsCustomBrand(false);
      }
    }
  }, [metadata]);

  // Close modifier dropdown if user clicks outside
  useEffect(() => {
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

  function handleFieldChange(field: string, value: string) {
    const updated = { ...localMeta, [field]: value };
    setLocalMeta(updated);
    onMetadataChange(updated);
  }

  function handleBrandChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === "Other") {
      setIsCustomBrand(true);
      handleFieldChange("brand", "Other");
    } else {
      setIsCustomBrand(false);
      handleFieldChange("brand", val);
    }
  }

  function handleCustomBrandChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFieldChange("brand", e.target.value);
  }

  // Multi-check modifiers
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
          value={isCustomBrand ? "Other" : localMeta.brand || ""}
          onChange={handleBrandChange}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
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
            value={localMeta.brand}
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
