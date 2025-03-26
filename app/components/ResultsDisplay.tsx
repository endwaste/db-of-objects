import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/solid";
import axios from "axios";
import Image from "next/image";
import React, { useState, useEffect, useRef } from "react";
import WholeImageViewer from "./WholeImageViewer";

interface Result {
  score: number;
  metadata: {
    class?: string;
    date_added?: string;
    s3_file_name?: string;
    s3_file_path?: string;
    s3_presigned_url: string;
    whole_image_presigned_url?: string;
    file_type: "image" | "video" | "text";
    start_offset_sec?: number;
    end_offset_sec?: number;
    interval_sec?: number;
    segment?: number;
    brand?: string;
    modifier?: string;
    color?: string;
    coordinates?: string;
    datetime_taken?: string;
    embedding_id?: string;
    material?: string;
    original_s3_uri?: string;
    robot?: string;
    shape?: string;
    comment?: string;
    labeler_name?: string;
    timestamp?: string;
    pick_point?: string;
  };
}

interface ResultsDisplayProps {
  apiUrl: string;
  isLoadingResults: boolean;
  results: Result[];
  getScoreLabel: (score: number) => { score: string };
  getVideoId: (result: Result, index: number) => string;
  onEdit?: (metadata: Record<string, any>) => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  isLoadingResults,
  apiUrl,
  results,
  getScoreLabel,
  getVideoId,
  onEdit,
}) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedWholeImage, setSelectedWholeImage] = useState<string | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<string | null>(null);
  const [showMore, setShowMore] = useState<Record<string, boolean>>({});

  const toggleShowMore = (id: string) => {
    setShowMore((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = async (embeddingId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this object?");
    if (!confirmDelete) return;

    try {
      await axios.post(`${apiUrl}/delete`, { embedding_id: embeddingId });
      setSuccessMessage("Object deleted successfully.");
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete entry:", error);
      setSuccessMessage("Failed to delete object. Please try again.");
    }
  };

  const handleEdit = (metadata: Record<string, any>) => {
    if (onEdit) onEdit(metadata);
  };

  const openWholeImage = (imageUrl: string, coordinates?: string) => {
    setSelectedWholeImage(imageUrl);
    setSelectedCoordinates(coordinates || null);
  };

  const closeWholeImage = () => {
    setSelectedWholeImage(null);
    setSelectedCoordinates(null);
  };

  // -- NEW HELPER: parse multiple pick points, e.g. "0.4,0.3;0.8,0.6"
  function parsePickPoints(pickPointStr: string | undefined): [number, number][] {
    if (!pickPointStr) return [];
    return pickPointStr
      .split(";")
      .map((pair) => pair.trim())
      .map((pair) => {
        const [xStr, yStr] = pair.split(",");
        const px = parseFloat(xStr);
        const py = parseFloat(yStr);
        return [px, py] as [number, number];
      })
      .filter(([px, py]) => !isNaN(px) && !isNaN(py));
  }

  return (
    <div className="w-full">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500 text-white p-2 rounded mb-4">
          {successMessage}
        </div>
      )}

      {/* Loading State */}
      {isLoadingResults ? (
        <>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
            {[...Array(20)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="bg-gray-300 h-64 w-full rounded-md"></div>
                <div className="h-4 bg-gray-300 rounded w-3/4 mt-2"></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
            {results.map((result, index) => {
              const { score } = getScoreLabel(result.score);
              const roundedScore = parseFloat(score).toFixed(3); // Round to 3 decimal places
              const videoId = getVideoId(result, index);
              const metadataId = result.metadata.embedding_id || `${index}`;

              // We highlight a few metadata fields first:
              const prioritizedMetadata: Record<string, string | undefined> = {
                Color: result.metadata.color,
                Material: result.metadata.material,
                "Form Factor": result.metadata.shape,
                Brand: result.metadata.brand,
                Modifier: result.metadata.modifier,
                "Labeler's name": result.metadata.labeler_name,
              };

              // The rest goes under "Show More"
              const otherMetadata = Object.entries(result.metadata).filter(
                ([key, value]) =>
                  ![
                    "file_type",
                    "s3_presigned_url",
                    "s3_file_name",
                    "whole_image_presigned_url",
                    "color",
                    "material",
                    "shape",
                    "brand",
                    "modifier",
                    "labeler_name",
                  ].includes(key) && value
              );

              // Parse multiple pick points
              const pickPoints = parsePickPoints(result.metadata.pick_point);

              // Each card rendering:
              return (
                <div key={videoId} className="relative group rounded-md overflow-hidden">
                  {/* Action Buttons */}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 mt-2 mr-2 ml-2">
                    <button onClick={() => handleEdit(result.metadata)} className="text-blue-500 hover:text-blue-700">
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(result.metadata.embedding_id || "")}
                      className="text-red-500 hover:text-red-700"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Display Image & Score & Red crosses */}
                  <div className="bg-white rounded-md shadow-md overflow-hidden flex flex-col">
                    <div className="mt-3 mr-3 ml-3">
                      <ImageContainer
                        imageUrl={result.metadata.s3_presigned_url}
                        score={roundedScore}
                        pickPoints={pickPoints}
                        wholeImageUrl={result.metadata.whole_image_presigned_url}
                        coordinates={result.metadata.coordinates}
                        onViewWholeImage={() =>
                          openWholeImage(
                            result.metadata.whole_image_presigned_url || "",
                            result.metadata.coordinates
                          )
                        }
                      />
                    </div>

                    {/* Metadata */}
                    <div
                      className={`p-4 text-gray-800 text-xs overflow-hidden transition-all duration-300 ${
                        showMore[metadataId] ? "h-auto" : "h-35"
                      }`}
                    >
                      {Object.entries(prioritizedMetadata).map(([key, value]) => (
                        <p key={key} className="mb-2 truncate">
                          <strong>{key}:</strong> {value || "-"}
                        </p>
                      ))}

                      {showMore[metadataId] &&
                        otherMetadata.map(([key, value]) => (
                          <p key={key} className="mb-2">
                            <strong>{key}:</strong> {value}
                          </p>
                        ))}

                      <button
                        onClick={() => toggleShowMore(metadataId)}
                        className="mt-4 text-blue-500 hover:text-blue-700 flex items-center"
                      >
                        {showMore[metadataId] ? (
                          <>
                            Show Less <ChevronUpIcon className="w-4 h-4 ml-1" />
                          </>
                        ) : (
                          <>
                            Show More <ChevronDownIcon className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {selectedWholeImage && (
        <WholeImageViewer
          imageUrl={selectedWholeImage || ""}
          coordinates={selectedCoordinates || undefined}
          onClose={closeWholeImage}
        />
      )}
    </div>
  );
};

export default ResultsDisplay;

/**
 * A separate component to handle the forced 4:3 box,
 * the `object-contain` letterboxing,
 * and placing the red cross for each pick point.
 */
interface ImageContainerProps {
  imageUrl: string;
  score: string;
  pickPoints: [number, number][]; // multiple pick points
  wholeImageUrl?: string;
  coordinates?: string;
  onViewWholeImage: () => void;
}

const ImageContainer: React.FC<ImageContainerProps> = ({
  imageUrl,
  score,
  pickPoints,
  wholeImageUrl,
  coordinates,
  onViewWholeImage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({
    containerWidth: 0,
    containerHeight: 0,
    imgWidth: 0,
    imgHeight: 0,
  });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Once the image has loaded, measure the container (fixed 4:3 box).
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDims((prev) => ({
      ...prev,
      containerWidth: rect.width,
      containerHeight: rect.height,
    }));
  }, [imageLoaded]);

  // We'll compute letterboxing info once
  // then for each pick point we apply the same offsets
  let renderedWidth = 0;
  let renderedHeight = 0;
  let offsetX = 0;
  let offsetY = 0;

  const { containerWidth, containerHeight, imgWidth, imgHeight } = dims;
  if (imgWidth > 0 && imgHeight > 0 && containerWidth > 0 && containerHeight > 0) {
    const containerAspect = containerWidth / containerHeight;
    const imageAspect = imgWidth / imgHeight;

    if (imageAspect > containerAspect) {
      // image is "wider" => fill container width
      renderedWidth = containerWidth;
      renderedHeight = (containerWidth / imgWidth) * imgHeight;
    } else {
      // image is "taller" => fill container height
      renderedHeight = containerHeight;
      renderedWidth = (containerHeight / imgHeight) * imgWidth;
    }
    offsetX = (containerWidth - renderedWidth) / 2;
    offsetY = (containerHeight - renderedHeight) / 2;
  }

  return (
    <div ref={containerRef} className="relative overflow-hidden" style={{ aspectRatio: "4/3" }}>
      <Image
        src={imageUrl}
        alt="Result"
        className="absolute top-0 left-0 w-full h-full object-contain"
        width={640}
        height={480}
        onLoadingComplete={(img) => {
          // Store the image's natural dimensions
          const { naturalWidth, naturalHeight } = img;
          setDims((prev) => {
            if (prev.imgWidth !== naturalWidth || prev.imgHeight !== naturalHeight) {
              return {
                ...prev,
                imgWidth: naturalWidth,
                imgHeight: naturalHeight,
              };
            }
            return prev;
          });
          setImageLoaded(true);
        }}
      />

      {/* Overlaid similarity score */}
      <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded-md shadow-md">
        {score}
      </div>

      {/* Place a red cross for each pick point */}
      {pickPoints.map(([px, py], i) => {
        if (isNaN(px) || isNaN(py)) return null;
        const crossLeft = offsetX + px * renderedWidth;
        const crossTop = offsetY + py * renderedHeight;
        return (
          <div
            key={i}
            className="absolute text-red-600 font-bold select-none"
            style={{
              left: crossLeft,
              top: crossTop,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              fontSize: "1.25rem",
            }}
          >
            +
          </div>
        );
      })}

      {wholeImageUrl && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={onViewWholeImage}
            className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md shadow-md hover:bg-blue-700 focus:outline-none"
          >
            View whole image
          </button>
        </div>
      )}
    </div>
  );
};
