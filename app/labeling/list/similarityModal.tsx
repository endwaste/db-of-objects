"use client";

import React, { useState } from "react";
import MetadataForm from "./metadataForm";

export interface CropItem {
    original_s3_uri: string;
    bounding_box: string;
    labeled: boolean;
    labeler_name: string;
    difficult: boolean;
}
  
export interface SimilarityResult {
    crop_s3_uri: string;
    crop_presigned_url: string;
    incoming_crop_metadata: Record<string, any>;
    similar_crop_s3_uri: string;
    similar_crop_presigned_url: string | null;
    similar_crop_metadata: Record<string, any>;
    score: number | null;
    embedding_id: string | null;
}

interface SimilarityModalProps {
  showModal: boolean;
  similarityData: SimilarityResult | null;

  // We need to know if the CSV had incoming data.
  csvHadIncoming: boolean;

  // These are fields for labeler's name, difficult
  labelerName: string;
  setLabelerName: (val: string) => void;
  difficult: boolean;
  setDifficult: (val: boolean) => void;

  // Parent callbacks
  onClose: () => void;
  onAddToUDO: () => void;
  onNext: () => void;
  onFinish: () => void;

  // Let parent maintain the main "similarityData" object
  onUpdateSimilarityData: (updated: SimilarityResult) => void;
}

// We'll define a type for your crosshair style
const crossArmStyle: React.CSSProperties = {
  position: "absolute",
  background: "red",
};

/**
 * A dedicated modal that shows "Incoming Crop" and "Similar Crop" side by side,
 * plus the labeler name, difficult checkbox, etc.
 */
export default function SimilarityModal({
  showModal,
  similarityData,
  csvHadIncoming,
  labelerName,
  setLabelerName,
  difficult,
  setDifficult,
  onClose,
  onAddToUDO,
  onNext,
  onFinish,
  onUpdateSimilarityData,
}: SimilarityModalProps) {
  // Manage internal toggles for pick-point overlays
  const [showIncomingOverlay, setShowIncomingOverlay] = useState(false);
  const [showSimilarOverlay, setShowSimilarOverlay] = useState(false);

  // If not visible or no data => render nothing
  if (!showModal || !similarityData) {
    return null;
  }

  // Helper: decide which text+color to show for the incoming crop's metadata source
  function getIncomingSourceTag(): { text: string; color: string } {
    if (!similarityData) {
      return { text: "", color: "" };
    }
    const { embedding_id, incoming_crop_metadata } = similarityData;
    if (embedding_id) {
      return { text: "Metadata from UDO", color: "green" };
    } else if (csvHadIncoming) {
      return { text: "Metadata from CSV", color: "orange" };
    } else {
      return { text: "Metadata from similar crop", color: "purple" };
    }
  }

  // Called from the MetadataForm for incoming
  function handleIncomingMetaChange(updated: Record<string, any>) {
    if (!similarityData) return;

    onUpdateSimilarityData({
      ...similarityData,
      crop_s3_uri: similarityData.crop_s3_uri ?? "",
      crop_presigned_url: similarityData.crop_presigned_url ?? "",
      similar_crop_s3_uri: similarityData.similar_crop_s3_uri ?? "",
      similar_crop_presigned_url: similarityData.similar_crop_presigned_url ?? "",
      similar_crop_metadata: similarityData.similar_crop_metadata ?? {},
      score: similarityData.score ?? null,
      embedding_id: similarityData.embedding_id ?? null,
      incoming_crop_metadata: updated,
    });
  }

  // Called from the MetadataForm for similar
  function handleSimilarMetaChange(updated: Record<string, any>) {
    if (!similarityData) return;

    onUpdateSimilarityData({
      ...similarityData,
      crop_s3_uri: similarityData.crop_s3_uri ?? "",
      crop_presigned_url: similarityData.crop_presigned_url ?? "",
      similar_crop_s3_uri: similarityData.similar_crop_s3_uri ?? "",
      similar_crop_presigned_url: similarityData.similar_crop_presigned_url ?? "",
      similar_crop_metadata: updated,
      score: similarityData.score ?? null,
      embedding_id: similarityData.embedding_id ?? null,
      incoming_crop_metadata: similarityData.incoming_crop_metadata ?? {},
    });
  }


    // Handle click on the incoming image => set pick_point
  function handleIncomingImgClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!showIncomingOverlay || !similarityData) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const xPos = e.clientX - rect.left;
    const yPos = e.clientY - rect.top;
    const xFrac = (xPos / rect.width).toFixed(2);
    const yFrac = (yPos / rect.height).toFixed(2);

    onUpdateSimilarityData({
      ...similarityData,
      crop_s3_uri: similarityData.crop_s3_uri ?? "",
      crop_presigned_url: similarityData.crop_presigned_url ?? "",
      similar_crop_s3_uri: similarityData.similar_crop_s3_uri ?? "",
      similar_crop_presigned_url: similarityData.similar_crop_presigned_url ?? "",
      similar_crop_metadata: similarityData.similar_crop_metadata ?? {},
      score: similarityData.score ?? null,
      embedding_id: similarityData.embedding_id ?? null,
      incoming_crop_metadata: {
        ...similarityData.incoming_crop_metadata,
        pick_point: `${xFrac},${yFrac}`,
      },
    });
  }


  // Handle click on the similar image => set pick_point
  function handleSimilarImgClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!showSimilarOverlay || !similarityData) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const xPos = e.clientX - rect.left;
    const yPos = e.clientY - rect.top;
    const xFrac = (xPos / rect.width).toFixed(2);
    const yFrac = (yPos / rect.height).toFixed(2);

    onUpdateSimilarityData({
      ...similarityData,
      crop_s3_uri: similarityData.crop_s3_uri ?? "",
      crop_presigned_url: similarityData.crop_presigned_url ?? "",
      similar_crop_s3_uri: similarityData.similar_crop_s3_uri ?? "",
      similar_crop_presigned_url: similarityData.similar_crop_presigned_url ?? "",
      similar_crop_metadata: {
        ...similarityData.similar_crop_metadata,
        pick_point: `${xFrac},${yFrac}`,
      },
      score: similarityData.score ?? null,
      embedding_id: similarityData.embedding_id ?? null,
      incoming_crop_metadata: similarityData.incoming_crop_metadata ?? {},
    });
  }


  // Crosshair styling
  function pickPointCrossStyle(pickPoint?: string): React.CSSProperties {
    if (!pickPoint) return { display: "none" };
    const [xStr, yStr] = pickPoint.split(",");
    const x = parseFloat(xStr) || 0;
    const y = parseFloat(yStr) || 0;
    return {
      position: "absolute",
      left: `${(x * 100).toFixed(1)}%`,
      top: `${(y * 100).toFixed(1)}%`,
      width: 0,
      height: 0,
      pointerEvents: "none",
      transform: "translate(-50%, -50%)",
    };
  }

  function pickPointButtonLabel(pickPoint?: string) {
    return pickPoint ? "Reselect Pick Point" : "Select Pick Point";
  }

  const { text: incomingTagText, color: incomingTagColor } = getIncomingSourceTag();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          padding: "1rem",
          width: "80%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
          fontSize: "14px",
        }}
      >
        <h2
          style={{
            marginBottom: "1rem",
            fontSize: "1.4rem",
            borderBottom: "1px solid #ddd",
            paddingBottom: "0.5rem",
          }}
        >
          Similarity Result
        </h2>

        {/* -- Two columns: Incoming Crop & Similar Crop -- */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            marginBottom: "1rem",
            alignItems: "flex-start",
          }}
        >
          {/* -------------------- Incoming Crop Column -------------------- */}
          <div
            style={{
              flex: 1,
              border: "1px solid #eee",
              borderRadius: "6px",
              padding: "1rem",
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
            }}
          >
            <h3
              style={{
                marginBottom: "0.5rem",
                fontSize: "1rem",
                borderBottom: "1px solid #ddd",
                paddingBottom: "0.25rem",
              }}
            >
              Incoming Crop
              {incomingTagText && (
                <span
                  style={{
                    display: "inline-block",
                    marginBottom: "0.5rem",
                    background: incomingTagColor,
                    color: "#fff",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    marginLeft: "30px",
                  }}
                >
                  {incomingTagText}
                </span>
              )}
            </h3>

            {similarityData.crop_presigned_url ? (
              <>
                <div
                  style={{
                    position: "relative",
                    display: "block",
                    lineHeight: 0,
                    maxWidth: "400px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <img
                    src={similarityData.crop_presigned_url}
                    alt="Incoming Crop"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      margin: 0,
                      padding: 0,
                      cursor: showIncomingOverlay ? "crosshair" : "default",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                    onClick={handleIncomingImgClick}
                  />
                  <div
                    style={pickPointCrossStyle(
                      similarityData.incoming_crop_metadata.pick_point
                    )}
                  >
                    <div
                      style={{
                        ...crossArmStyle,
                        width: "1px",
                        height: "14px",
                        top: "-7px",
                        left: "0px",
                      }}
                    />
                    <div
                      style={{
                        ...crossArmStyle,
                        width: "14px",
                        height: "1px",
                        top: "0px",
                        left: "-7px",
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowIncomingOverlay((prev) => !prev)}
                  style={{
                    marginBottom: "1rem",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    border: "1px solid #bbb",
                    background: "#e6e6e6",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {pickPointButtonLabel(
                    similarityData.incoming_crop_metadata.pick_point
                  )}
                </button>
              </>
            ) : (
              <p>No incoming crop URL</p>
            )}

            <MetadataForm
              metadata={similarityData.incoming_crop_metadata}
              onMetadataChange={handleIncomingMetaChange}
            />

            {/* If there's an embedding_id => we are already in DB => disable */}
            <div style={{ marginTop: "1rem" }}>
              <button
                onClick={onAddToUDO}
                disabled={Boolean(similarityData.embedding_id)}
                style={{
                  backgroundColor: "#4caf50",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.5rem 1rem",
                  cursor: similarityData.embedding_id
                    ? "not-allowed"
                    : "pointer",
                  opacity: similarityData.embedding_id ? 0.6 : 1,
                }}
              >
                Add to UDO
              </button>
            </div>
          </div>

          {/* -------------------- Similar Crop Column -------------------- */}
          <div
            style={{
              flex: 1,
              border: "1px solid #eee",
              borderRadius: "6px",
              padding: "1rem",
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
            }}
          >
            <h3
              style={{
                marginBottom: "0.5rem",
                fontSize: "1rem",
                borderBottom: "1px solid #ddd",
                paddingBottom: "0.75rem",
              }}
            >
              Similar Crop
            </h3>

            {similarityData.similar_crop_presigned_url ? (
              <>
                <div
                  style={{
                    position: "relative",
                    display: "block",
                    lineHeight: 0,
                    maxWidth: "400px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <img
                    src={similarityData.similar_crop_presigned_url}
                    alt="Similar Crop"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      margin: 0,
                      padding: 0,
                      cursor: showSimilarOverlay ? "crosshair" : "default",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                    onClick={handleSimilarImgClick}
                  />
                  <div
                    style={pickPointCrossStyle(
                      similarityData.similar_crop_metadata.pick_point
                    )}
                  >
                    <div
                      style={{
                        ...crossArmStyle,
                        width: "1px",
                        height: "14px",
                        top: "-7px",
                        left: "0px",
                      }}
                    />
                    <div
                      style={{
                        ...crossArmStyle,
                        width: "14px",
                        height: "1px",
                        top: "0px",
                        left: "-7px",
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowSimilarOverlay((prev) => !prev)}
                  style={{
                    marginBottom: "1rem",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    border: "1px solid #bbb",
                    background: "#e6e6e6",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {pickPointButtonLabel(
                    similarityData.similar_crop_metadata.pick_point
                  )}
                </button>
              </>
            ) : (
              <p>No similar crop URL</p>
            )}

            <MetadataForm
              metadata={similarityData.similar_crop_metadata}
              onMetadataChange={handleSimilarMetaChange}
            />
          </div>
        </div>

        {/* ------- Center fields (Labeler name, difficult) ------- */}
        <div style={{ textAlign: "center", margin: "1.5rem 0" }}>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ marginRight: "6px", fontWeight: "bold" }}>
              Labeler&apos;s name:
            </label>
            <input
              type="text"
              value={labelerName}
              onChange={(e) => setLabelerName(e.target.value)}
              style={{
                padding: "4px 6px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </div>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ fontWeight: "bold" }}>
              <input
                type="checkbox"
                checked={difficult}
                onChange={(e) => setDifficult(e.target.checked)}
                style={{ marginRight: "6px" }}
              />
              Difficult
            </label>
          </div>
        </div>

        {/* ------- Bottom Buttons (Close, Finish, Next) ------- */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <button
            onClick={onClose}
            style={{
              backgroundColor: "#6c757d",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={onFinish}
            style={{
              backgroundColor: "#28a745",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Finish Labeling
          </button>
          <button
            onClick={onNext}
            style={{
              backgroundColor: "#007BFF",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
